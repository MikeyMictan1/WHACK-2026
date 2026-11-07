"""The backend's end of the laptop bridge (the laptop runs `python -m app.bridge`).

In the cloud there's no reader or LED board next to the server, so a laptop with them plugged in
connects to /api/nfc/bridge over a WebSocket (authenticated with BRIDGE_TOKEN):

  laptop -> server   {"type": "reader", "name": str | None}
                     {"type": "card", "uid": "..."} / {"type": "card_removed"}
                     {"type": "board", "connected": bool, "port": str | None, "fast": bool}
                     {"type": "reply", "id": n, "ok": true, ...} / {"ok": false, "error": "..."}
                     (open replies {"uid", "card_type", "capacity"}; read replies {"data": hex})
  server -> laptop   {"type": "call", "id": n, "op": "open" | "read" | "write" | "close", ...}
                     {"type": "frame", "hex": "<768 bytes as hex>"}

Taps feed the same NfcHub as a local reader, so every screen that asks for a tap works the same.
Card memory (saving data with "Log out with NFC", logging in with a saved card) goes through
RemoteTag, which looks like core/nfc_card.Tag but asks the laptop to do each read and write.
Encryption stays on the server; the laptop only moves raw bytes.
"""

import asyncio
import concurrent.futures
import itertools
import json
import threading
from typing import Any

from app.core.nfc_card import NfcError

CALL_TIMEOUT = 15  # seconds for one card operation on the laptop
Color = tuple[int, int, int]


class BridgeLink:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._ws: Any = None  # the connected fastapi WebSocket
        self._ids = itertools.count(1)
        self._pending: dict[int, concurrent.futures.Future[dict]] = {}
        self._frame_send: concurrent.futures.Future[None] | None = None
        self.board: dict[str, object] = {"connected": False, "port": None, "fast": False}

    @property
    def connected(self) -> bool:
        return self._ws is not None

    # ---- connection (called from the WebSocket endpoint, on the event loop) ----
    def attach(self, ws: Any) -> Any:
        """Use this WebSocket from now on. Returns the one it replaced (to be closed), if any."""
        with self._lock:
            old, self._ws, self._loop = self._ws, ws, asyncio.get_running_loop()
        return old

    def detach(self, ws: Any) -> bool:
        """Forget this WebSocket if it's still the current one. True if it was."""
        with self._lock:
            if self._ws is not ws:
                return False
            self._ws = None
            pending, self._pending = self._pending, {}
        for fut in pending.values():
            if not fut.done():
                fut.set_exception(NfcError("The laptop bridge disconnected."))
        self.board = {"connected": False, "port": None, "fast": False}
        return True

    def got_reply(self, msg: dict) -> None:
        with self._lock:
            fut = self._pending.pop(int(msg.get("id", 0)), None)
        if fut is not None and not fut.done():
            fut.set_result(msg)

    # ---- used from worker threads ----------------------------------------------
    def _send(self, msg: dict) -> concurrent.futures.Future[None]:
        ws, loop = self._ws, self._loop
        if ws is None or loop is None:
            raise NfcError("No card reader is connected.")
        return asyncio.run_coroutine_threadsafe(ws.send_text(json.dumps(msg)), loop)

    def call(self, op: str, timeout: float = CALL_TIMEOUT, **args: object) -> dict:
        """Ask the laptop to do one card operation and wait for its answer. Raises NfcError."""
        call_id = next(self._ids)
        fut: concurrent.futures.Future[dict] = concurrent.futures.Future()
        with self._lock:
            self._pending[call_id] = fut
        try:
            self._send({"type": "call", "id": call_id, "op": op, **args})
            reply = fut.result(timeout)
        except concurrent.futures.TimeoutError:
            raise NfcError("The laptop reader didn't answer. Check the bridge is running.") from None
        finally:
            with self._lock:
                self._pending.pop(call_id, None)
        if not reply.get("ok"):
            raise NfcError(str(reply.get("error") or "The card operation failed on the laptop."))
        return reply

    def send_frame(self, frame: list[Color]) -> None:
        """Show a frame on the laptop's LED board. Skipped while the previous one is still sending."""
        if self._ws is None or (self._frame_send is not None and not self._frame_send.done()):
            return
        try:
            self._frame_send = self._send({"type": "frame", "hex": "".join(f"{r:02x}{g:02x}{b:02x}" for r, g, b in frame)})
        except NfcError:
            pass


class RemoteTag:
    """The card on the laptop's reader, with the same surface as nfc_card.Tag (uid, type,
    capacity, read, write). Open it while holding the server's card_lock, then close() it."""

    def __init__(self, link: BridgeLink) -> None:
        self._link = link
        info = link.call("open")
        self.uid = bytes.fromhex(str(info["uid"]))
        self.type = str(info["card_type"])
        self.capacity = int(info["capacity"])

    def read(self, length: int) -> bytes:
        return bytes.fromhex(str(self._link.call("read", length=length)["data"]))

    def write(self, payload: bytes) -> None:
        self._link.call("write", timeout=CALL_TIMEOUT * 2, data=payload.hex())

    def close(self) -> None:
        try:
            self._link.call("close", timeout=5)
        except NfcError:
            pass


bridge = BridgeLink()
