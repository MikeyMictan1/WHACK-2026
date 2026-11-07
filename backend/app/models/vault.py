"""The user's data ("vault") and where it currently lives: on our system or on their NFC card.

  * Normal logout       -> data stays in the database (location "system").
  * Log out with NFC    -> data is written to the card and erased from the database
                           (location "card"); the row remembers a one-time save id.
  * Tap card (logged out)-> data moves back into the database, the card is blanked.

The save id makes each card save usable exactly once: copying a card's bytes and
replaying them later, or a card whose wipe failed, no longer matches and is ignored.

On-card format (bytes):
    "WK" | version (1) | length of rest (2, big-endian) | nonce (12) | AES-GCM ciphertext+tag
The plaintext is zlib-compressed JSON {"u": user_id, "s": save_id, "d": data, "t": saved_at}.
The card's UID is the GCM associated data, so the bytes only decrypt on that card.
"""

import hashlib
import json
import os
import struct
import time
import zlib
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlmodel import Field, Session, SQLModel

from app.models.clock import site_now
from app.core.config import settings
from app.core.nfc_card import NfcError, Tag

Location = Literal["system", "card"]


# ---- Table -----------------------------------------------------------------

class Vault(SQLModel, table=True):
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    data: str = "{}"  # JSON; empty while the data is on the card
    location: str = "system"
    card_save_id: str | None = None  # set while location == "card"
    updated_at: datetime = Field(default_factory=lambda: site_now())


def _row(session: Session, user_id: int) -> Vault:
    row = session.get(Vault, user_id)
    if row is None:
        row = Vault(user_id=user_id)
        session.add(row)
    return row


def get_vault(session: Session, user_id: int) -> tuple[Location, dict[str, Any]]:
    row = _row(session, user_id)
    return row.location, json.loads(row.data)  # type: ignore[return-value]


def set_vault(session: Session, user_id: int, data: dict[str, Any]) -> None:
    row = _row(session, user_id)
    if row.location == "card":
        raise NfcError("Your data is on your NFC card. Log out and tap the card to bring it back first.")
    row.data = json.dumps(data, separators=(",", ":"))
    row.updated_at = site_now()
    session.commit()


# ---- card format ----------------------------------------------------------
MAGIC = b"WK"
VERSION = 2
_HEADER = struct.Struct(">2sBH")  # magic, version, body length
OVERHEAD = _HEADER.size + 12 + 16  # header + nonce + GCM tag = 33 bytes

_key = hashlib.sha256(f"nfc-vault:{settings.nfc_secret or settings.jwt_secret}".encode()).digest()


@dataclass
class CardSave:
    user_id: int
    save_id: str
    data: dict[str, Any]
    saved_at: int


def _pack(save: CardSave, uid: bytes) -> bytes:
    obj = {"u": save.user_id, "s": save.save_id, "d": save.data, "t": save.saved_at}
    plain = zlib.compress(json.dumps(obj, separators=(",", ":")).encode(), 9)
    nonce = os.urandom(12)
    body = nonce + AESGCM(_key).encrypt(nonce, plain, uid)
    return _HEADER.pack(MAGIC, VERSION, len(body)) + body


def read_card(tag: Tag) -> CardSave | None:
    """The save on this card, or None if the card is blank / not ours / unreadable."""
    magic, version, length = _HEADER.unpack(tag.read(_HEADER.size))
    if magic != MAGIC or version != VERSION or length > tag.capacity:
        return None
    body = tag.read(_HEADER.size + length)[_HEADER.size :]
    try:
        obj = json.loads(zlib.decompress(AESGCM(_key).decrypt(body[:12], body[12:], tag.uid)))
    except (InvalidTag, ValueError, zlib.error):
        return None
    return CardSave(int(obj["u"]), str(obj["s"]), obj["d"], int(obj["t"]))


def is_live(session: Session, save: CardSave) -> bool:
    """True if this card save is the one the database is waiting for (not stale or replayed)."""
    row = session.get(Vault, save.user_id)
    return row is not None and row.location == "card" and row.card_save_id == save.save_id


def wipe_card(tag: Tag) -> None:
    tag.write(bytes(min(tag.capacity, 48)))  # blank header + start of data is enough


# ---- the two transfers -------------------------------------------------------

def move_to_card(session: Session, tag: Tag, user_id: int) -> int:
    """Write the user's data to the card, then erase it from the database. Returns bytes used."""
    existing = read_card(tag)
    if existing and is_live(session, existing):
        raise NfcError("This card already holds someone's saved data. Use a blank card.")

    row = _row(session, user_id)
    if row.location == "card":
        raise NfcError("Your data is already on an NFC card.")
    save = CardSave(user_id, os.urandom(8).hex(), json.loads(row.data), int(time.time()))
    blob = _pack(save, tag.uid)
    tag.write(blob)  # verifies by reading back; raises if anything went wrong

    row.data, row.location, row.card_save_id = "{}", "card", save.save_id
    row.updated_at = site_now()
    session.commit()
    return len(blob)


def move_from_card(session: Session, tag: Tag) -> int:
    """Bring a card's data back into the database and blank the card. Returns the user id."""
    save = read_card(tag)
    if save is None:
        raise NfcError("This NFC card is blank.")
    if not is_live(session, save):
        wipe_card(tag)  # stale copy of an old save: clean it up
        raise NfcError("This card's data was already used, so it was cleared. The card is blank now.")

    row = _row(session, save.user_id)
    row.data, row.location, row.card_save_id = json.dumps(save.data, separators=(",", ":")), "system", None
    row.updated_at = site_now()
    session.commit()
    try:
        wipe_card(tag)
    except NfcError:
        pass  # data is safe in the database; the leftover save id no longer matches, so it's inert
    return save.user_id
