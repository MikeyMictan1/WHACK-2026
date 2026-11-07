"""Card taps, from whichever reader is around.

Two sources feed the same hub:
  * a reader plugged into this machine (a background thread polls it through PC/SC), and
  * a reader on a laptop running the bridge (`python -m app.bridge`), which reports over a
    WebSocket when the backend runs in the cloud (see core/bridge_link.py).

Events go to subscribers (the /api/nfc/events SSE stream, or the bridge forwarding them):
  {"type": "reader", "connected": bool, "name": str | None}
  {"type": "card", "uid": "04A1B2C3D4E5F6"}
  {"type": "card_removed"}
"""

import asyncio
import threading
import time

from app.core.nfc_card import card_lock

GET_UID = [0xFF, 0xCA, 0x00, 0x00, 0x00]  # PC/SC pseudo-APDU: read card UID
POLL_SECONDS = 0.3


class NfcHub:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict]]] = set()
        self._lock = threading.Lock()
        self.local_reader: str | None = None  # reader plugged into this machine
        self.bridge_reader: str | None = None  # reader on the laptop bridge
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        # Counts card taps (a card arriving on the reader) so requests can wait for a *new* tap.
        self.tap_seq = 0
        self.consumed_seq = -1  # tap already used by a screen (pay, save...), so it can't also log in
        self.current_uid: str | None = None  # card on the reader right now (None = no card)
        self.tap_cond = threading.Condition()

    @property
    def reader_name(self) -> str | None:
        """The reader in use: a local one wins, otherwise the bridge's. None = no reader at all."""
        return self.local_reader or self.bridge_reader

    # --- subscriber side (async) ---
    def subscribe(self) -> asyncio.Queue[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue()
        with self._lock:
            self._subscribers.add((asyncio.get_running_loop(), queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        with self._lock:
            self._subscribers = {s for s in self._subscribers if s[1] is not queue}

    def _publish(self, event: dict) -> None:
        with self._lock:
            subs = list(self._subscribers)
        for loop, queue in subs:
            loop.call_soon_threadsafe(queue.put_nowait, event)

    # --- what the sources report ---
    def set_reader(self, name: str | None, *, bridge: bool) -> None:
        before = self.reader_name
        if bridge:
            self.bridge_reader = name
        else:
            self.local_reader = name
        if self.reader_name != before:
            if before is not None:
                self.card_seen(None)  # the old reader's card is gone with it
            self._publish({"type": "reader", "connected": self.reader_name is not None, "name": self.reader_name})

    def card_seen(self, uid: str | None) -> None:
        """A card arrived (uid) or left (None)."""
        if uid == self.current_uid:
            return
        self.current_uid = uid
        if uid:
            with self.tap_cond:
                self.tap_seq += 1
                self.tap_cond.notify_all()
            self._publish({"type": "card", "uid": uid})
        else:
            self._publish({"type": "card_removed"})

    def wait_for_tap(self, after_seq: int, cancel: threading.Event, timeout: float) -> int | None:
        """Block until a card is tapped after `after_seq`. Returns its seq, or None on cancel/timeout."""
        deadline = time.monotonic() + timeout
        with self.tap_cond:
            while self.tap_seq <= after_seq:
                left = deadline - time.monotonic()
                if cancel.is_set() or left <= 0:
                    return None
                self.tap_cond.wait(min(left, 0.25))
            return self.tap_seq

    # --- local reader: polling thread ---
    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name="nfc-poll", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        try:
            from smartcard.scard import SCARD_LEAVE_CARD
            from smartcard.System import readers
            from smartcard.util import toHexString
        except ImportError:
            return  # pyscard missing: NFC simply stays disabled

        while not self._stop.is_set():
            try:
                found = readers()
            except Exception:
                found = []  # no PC/SC service (e.g. in the cloud): behaves as "no reader"
            name = str(found[0]) if found else None
            if name != self.local_reader:
                self.set_reader(name, bridge=False)

            if found:
                uid = None
                with card_lock:  # save/login requests also use the reader
                    try:
                        conn = found[0].createConnection()
                        conn.connect(disposition=SCARD_LEAVE_CARD)
                        data, sw1, sw2 = conn.transmit(GET_UID)
                        if (sw1, sw2) == (0x90, 0x00):
                            uid = toHexString(data).replace(" ", "")
                        conn.disconnect()
                    except Exception:
                        uid = None  # no card on the reader
                self.card_seen(uid)

            time.sleep(POLL_SECONDS)
