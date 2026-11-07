"""NFC reader bridge (ACR122U or any PC/SC reader).

Browsers can't talk to PC/SC readers, so a background thread polls the reader here
and streams events to the frontend over Server-Sent Events at /api/nfc/events:

  {"type": "reader", "connected": true,  "name": "ACS ACR122U ..."}
  {"type": "reader", "connected": false}
  {"type": "card",   "uid": "04A1B2C3D4E5F6"}
  {"type": "card_removed"}

Moving data between our system and a card (see app/models/vault.py):
  POST /api/nfc/logout         wait for a tap, move the user's data onto the card, log out
  POST /api/nfc/logout/cancel  the "Back" button while waiting
  POST /api/nfc/login          (logged out) tap: move the card's data back, blank the card, log in
"""

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator, Callable

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.controllers.auth_controller import _set_auth_cookie
from app.controllers.deps import CurrentUser, get_current_user_or_none
from app.core.config import settings
from app.core.database import SessionDep
from app.core.nfc_card import NfcError, Tag, card_lock, close_tag, open_tag
from app.models import vault
from app.models.user import User, UserPublic, get_user_by_id

router = APIRouter(prefix="/nfc", tags=["nfc"])

GET_UID = [0xFF, 0xCA, 0x00, 0x00, 0x00]  # PC/SC pseudo-APDU: read card UID
POLL_SECONDS = 0.3


class NfcHub:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict]]] = set()
        self._lock = threading.Lock()
        self.reader_name: str | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        # Counts card taps (a card arriving on the reader) so requests can wait for a *new* tap.
        self.tap_seq = 0
        self.consumed_seq = -1  # tap already used by "log out with NFC"
        self.tap_cond = threading.Condition()

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

    # --- polling thread ---
    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name="nfc-poll", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

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

    def _run(self) -> None:
        try:
            from smartcard.System import readers
            from smartcard.scard import SCARD_LEAVE_CARD
            from smartcard.util import toHexString
        except ImportError:
            return  # pyscard missing: NFC simply stays disabled

        last_uid: str | None = None
        while not self._stop.is_set():
            try:
                found = readers()
            except Exception:
                found = []
            name = str(found[0]) if found else None

            if name != self.reader_name:
                self.reader_name = name
                last_uid = None
                self._publish({"type": "reader", "connected": name is not None, "name": name})

            uid = None
            if found:
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

            if uid != last_uid:
                if uid:
                    with self.tap_cond:
                        self.tap_seq += 1
                        self.tap_cond.notify_all()
                    self._publish({"type": "card", "uid": uid})
                else:
                    self._publish({"type": "card_removed"})
                last_uid = uid

            time.sleep(POLL_SECONDS)


hub = NfcHub()


@router.get("/status")
def nfc_status() -> dict[str, object]:
    return {"connected": hub.reader_name is not None, "name": hub.reader_name}


@router.get("/events")
async def nfc_events(request: Request) -> StreamingResponse:
    queue = hub.subscribe()

    async def stream() -> AsyncIterator[str]:
        try:
            # Initial snapshot so the client knows the current state.
            snapshot = {"type": "hello", "connected": hub.reader_name is not None, "name": hub.reader_name}
            yield f"retry: 500\ndata: {json.dumps(snapshot)}\n\n"
            # End the stream every ~25 s; EventSource reconnects on its own. An
            # endless stream would block the server from ever shutting down / reloading.
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline and not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=5)
                    yield f"data: {json.dumps(event)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            hub.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---- log out with NFC / log in by tap ----------------------------------------

_pending_logouts: dict[int, threading.Event] = {}  # user id -> cancel flag
_pending_lock = threading.Lock()
TAP_WAIT_SECONDS = 60


def _on_card[T](action: Callable[[Tag], T]) -> T:
    with card_lock:
        try:
            tag = open_tag()
        except NfcError as e:
            raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
        try:
            return action(tag)
        except NfcError as e:
            raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
        finally:
            close_tag(tag)


@router.post("/logout")
def logout_with_nfc(user: CurrentUser, session: SessionDep, response: Response) -> dict[str, object]:
    """Wait (up to 60 s) for the user to tap a card, move their data onto it, then log out.

    Only a tap that happens *after* this request starts counts. Cancel with /nfc/logout/cancel.
    """
    assert user.id is not None
    cancel = threading.Event()
    with _pending_lock:
        if old := _pending_logouts.get(user.id):
            old.set()
        _pending_logouts[user.id] = cancel
    try:
        seq = hub.wait_for_tap(hub.tap_seq, cancel, TAP_WAIT_SECONDS)
        if seq is None:
            if cancel.is_set():
                raise HTTPException(499, "Cancelled.")
            raise HTTPException(status.HTTP_408_REQUEST_TIMEOUT, "No card was tapped. Try again.")
        hub.consumed_seq = seq  # this tap must not also log anyone in
        used = _on_card(lambda tag: (vault.move_to_card(session, tag, user.id), tag.capacity))
    finally:
        with _pending_lock:
            if _pending_logouts.get(user.id) is cancel:
                del _pending_logouts[user.id]
    response.delete_cookie(settings.cookie_name, path="/")
    return {"bytes_used": used[0], "capacity": used[1]}


@router.post("/logout/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_logout_with_nfc(user: CurrentUser) -> None:
    """The "Back" button on the tap-now screen."""
    with _pending_lock:
        if cancel := _pending_logouts.get(user.id or -1):
            cancel.set()


@router.post("/login", response_model=UserPublic)
def login_with_card(session: SessionDep, request: Request, response: Response) -> User:
    """Log in with the card on the reader. Its data moves to our system and the card is blanked."""
    if get_current_user_or_none(request, session) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already logged in. Tapping a card does nothing while logged in.")
    if hub.tap_seq == hub.consumed_seq:
        raise HTTPException(status.HTTP_409_CONFLICT, "Lift the card and tap again to log in.")
    user_id = _on_card(lambda tag: vault.move_from_card(session, tag))
    user = get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This card belongs to an account that no longer exists.")
    _set_auth_cookie(response, user)
    return user


@router.get("/card")
def card_info(session: SessionDep) -> dict[str, object]:
    """What's on the reader right now (handy for debugging)."""
    with card_lock:
        try:
            tag = open_tag()
        except NfcError as e:
            return {"present": False, "message": str(e)}
        try:
            save = vault.read_card(tag)
            return {
                "present": True,
                "type": tag.type,
                "uid": tag.uid.hex().upper(),
                "capacity": tag.capacity,
                "max_data_bytes": tag.capacity - vault.OVERHEAD,
                "holds_data": bool(save and vault.is_live(session, save)),
            }
        except NfcError as e:
            return {"present": True, "message": str(e)}
        finally:
            close_tag(tag)
