"""Raw read/write of an NFC tag's memory through a PC/SC reader (ACR122U).

Supported tags:
  * NTAG213 / 215 / 216 and MIFARE Ultralight (stickers, most "NFC tags")
      -> 4-byte pages starting at page 4; size comes from the Capability Container.
  * MIFARE Classic 1K (white cards / key fobs that often ship with the ACR122U)
      -> 16-byte blocks, skipping block 0 and each sector trailer; default keys.

Everything here is blocking and must run with `card_lock` held, because the
background poller in nfc_controller also talks to the reader.
"""

import threading

card_lock = threading.Lock()


class NfcError(Exception):
    """Something the user can act on (no card, unsupported card, too much data...)."""


# Card names from the ACR122U ATR (bytes 13-14)
_CLASSIC_1K, _CLASSIC_4K, _ULTRALIGHT, _MINI = 0x0001, 0x0002, 0x0003, 0x0026

_CLASSIC_KEYS = [
    bytes.fromhex("FFFFFFFFFFFF"),  # factory default
    bytes.fromhex("D3F7D3F7D3F7"),  # NFC Forum (NDEF) sectors
    bytes.fromhex("A0A1A2A3A4A5"),  # MAD sector
]


def _ok(sw1: int, sw2: int) -> bool:
    return (sw1, sw2) == (0x90, 0x00)


class Tag:
    """An open connection to the tag currently on the reader."""

    def __init__(self, connection) -> None:
        self.conn = connection
        atr = connection.getATR()
        self.kind = (atr[13] << 8 | atr[14]) if len(atr) >= 15 else None

        if self.kind == _ULTRALIGHT:
            self.type = "ntag"
            self.capacity = self._ntag_capacity()
        elif self.kind in (_CLASSIC_1K, _CLASSIC_4K):
            self.type = "classic"
            self._blocks = [b for b in range(1, 64) if b % 4 != 3]  # first 1K worth
            self.capacity = len(self._blocks) * 16
            self._authed_sector: int | None = None
        else:
            raise NfcError("This card type isn't supported. Use an NTAG215/216 sticker or a MIFARE Classic 1K card.")

        uid, sw1, sw2 = self._tx([0xFF, 0xCA, 0x00, 0x00, 0x00])
        if not _ok(sw1, sw2):
            raise NfcError("Couldn't read the card's ID. Hold it still on the reader.")
        self.uid = bytes(uid)

    def _tx(self, apdu: list[int]) -> tuple[list[int], int, int]:
        try:
            return self.conn.transmit(apdu)
        except Exception as e:
            raise NfcError("The card moved away from the reader. Keep it still and try again.") from e

    # ---- NTAG / Ultralight ---------------------------------------------
    def _ntag_capacity(self) -> int:
        data, sw1, sw2 = self._tx([0xFF, 0xB0, 0x00, 3, 4])
        if _ok(sw1, sw2) and data[0] == 0xE1 and data[2]:
            return data[2] * 8  # NTAG213=144, NTAG215=496, NTAG216=872
        return 48  # plain Ultralight

    def _ntag_read(self, length: int) -> bytes:
        out = bytearray()
        page = 4
        while len(out) < length:
            data, sw1, sw2 = self._tx([0xFF, 0xB0, 0x00, page, 16])
            if not _ok(sw1, sw2):
                raise NfcError("Reading the card failed.")
            out += bytes(data)
            page += 4
        return bytes(out[:length])

    def _ntag_write(self, payload: bytes) -> None:
        payload += b"\x00" * (-len(payload) % 4)
        for i in range(0, len(payload), 4):
            _, sw1, sw2 = self._tx([0xFF, 0xD6, 0x00, 4 + i // 4, 4, *payload[i : i + 4]])
            if not _ok(sw1, sw2):
                raise NfcError("Writing to the card failed. Is it write-protected?")

    # ---- MIFARE Classic ------------------------------------------------
    def _classic_auth(self, block: int) -> None:
        sector = block // 4
        if self._authed_sector == sector:
            return
        for key in _CLASSIC_KEYS:
            _, sw1, sw2 = self._tx([0xFF, 0x82, 0x00, 0x00, 0x06, *key])
            if not _ok(sw1, sw2):
                continue
            for key_type in (0x60, 0x61):  # key A, key B
                _, sw1, sw2 = self._tx([0xFF, 0x86, 0x00, 0x00, 0x05, 0x01, 0x00, block, key_type, 0x00])
                if _ok(sw1, sw2):
                    self._authed_sector = sector
                    return
        raise NfcError("This MIFARE card uses custom keys, so it can't be unlocked.")

    def _classic_read(self, length: int) -> bytes:
        out = bytearray()
        for block in self._blocks:
            if len(out) >= length:
                break
            self._classic_auth(block)
            data, sw1, sw2 = self._tx([0xFF, 0xB0, 0x00, block, 16])
            if not _ok(sw1, sw2):
                raise NfcError("Reading the card failed.")
            out += bytes(data)
        return bytes(out[:length])

    def _classic_write(self, payload: bytes) -> None:
        payload += b"\x00" * (-len(payload) % 16)
        for i, block in enumerate(self._blocks[: len(payload) // 16]):
            self._classic_auth(block)
            _, sw1, sw2 = self._tx([0xFF, 0xD6, 0x00, block, 16, *payload[i * 16 : i * 16 + 16]])
            if not _ok(sw1, sw2):
                raise NfcError("Writing to the card failed. Is it write-protected?")

    # ---- public --------------------------------------------------------
    def read(self, length: int) -> bytes:
        length = min(length, self.capacity)
        return self._ntag_read(length) if self.type == "ntag" else self._classic_read(length)

    def write(self, payload: bytes) -> None:
        if len(payload) > self.capacity:
            raise NfcError(f"Too much data for this card: needs {len(payload)} bytes, card holds {self.capacity}.")
        if self.type == "ntag":
            self._ntag_write(payload)
        else:
            self._classic_write(payload)
        if self.read(len(payload)) != payload:
            raise NfcError("The card didn't save correctly. Keep it on the reader and try again.")


def open_tag() -> Tag:
    """Connect to the tag on the first reader. Caller must hold `card_lock`."""
    from smartcard.scard import SCARD_LEAVE_CARD
    from smartcard.System import readers

    found = readers()
    if not found:
        raise NfcError("No NFC reader plugged in.")
    conn = found[0].createConnection()
    try:
        conn.connect(disposition=SCARD_LEAVE_CARD)  # don't reset the card on disconnect
    except Exception as e:
        raise NfcError("No card on the reader.") from e
    return Tag(conn)


def close_tag(tag: Tag) -> None:
    try:
        tag.conn.disconnect()
    except Exception:
        pass
