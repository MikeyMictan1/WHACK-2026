"""NFC reader bridge (ACR122U or any PC/SC reader).

Browsers can't talk to PC/SC readers, so a background thread polls the reader here
and streams events to the frontend over Server-Sent Events at /api/nfc/events:

  {"type": "reader", "connected": true,  "name": "ACS ACR122U ..."}
  {"type": "reader", "connected": false}
  {"type": "card",   "uid": "04A1B2C3D4E5F6"}
  {"type": "card_removed"}

A tap only does something when a screen is asking for one. Cards belong to child accounts:

  pay            shop_controller.pay waits for a tap; the card must be the child's (first card links)
  switch plan    negotiation_controller.confirm, same card check
  save data      POST /api/nfc/logout: the child's vault moves onto their card, then log out
                 (POST /api/nfc/logout/cancel is the "Back" button while waiting)
  log in         POST /api/nfc/login (nobody logged in): a card holding saved data restores it;
                 otherwise a card linked to a child logs that child in

Every screen that waits for a tap goes through `wait_for_card_tap`, so the same rules apply
whichever reader the tap came from.
"""

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator, Callable

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.controllers.auth_controller import _set_auth_cookie
from app.controllers.deps import CurrentChild, CurrentUser, get_current_user_or_none
from app.core.config import settings
from app.core.database import SessionDep
from app.core.nfc_card import NfcError, Tag, card_lock, close_tag, open_tag
from app.models import vault
from app.models.shop import CardError, check_card, child_for_card, normalize_uid
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
        self.consumed_seq = -1  # tap already used by a screen (pay, save...), so it can't also log in
        self.current_uid: str | None = None  # card on the reader right now (None = no card)
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
                self.current_uid = uid
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


def wait_for_card_tap(cancel: threading.Event, timeout: float) -> str:
    """Block until a card is tapped (only taps after this call count) and return its uid.

    The tap is marked as used, so it can't also log someone in. Raises HTTPException if there is
    no reader, the wait was cancelled (the "Back" button) or nobody tapped in time.
    """
    if hub.reader_name is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No card reader connected. Use Simulate tap.")
    seq = hub.wait_for_tap(hub.tap_seq, cancel, timeout)
    if seq is None:
        if cancel.is_set():
            raise HTTPException(499, "Cancelled.")
        raise HTTPException(status.HTTP_408_REQUEST_TIMEOUT, "No card was tapped. Try again.")
    hub.consumed_seq = seq
    uid = hub.current_uid
    if uid is None:
        raise HTTPException(status.HTTP_408_REQUEST_TIMEOUT, "The card was lifted too fast. Tap again.")
    return normalize_uid(uid)


def require_own_card(session: SessionDep, child_id: int, uid: str) -> None:
    """check_card as an HTTP error. Links the child's first card (the caller commits)."""
    try:
        check_card(session, child_id, uid)
    except CardError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e)) from e


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
def logout_with_nfc(user: CurrentChild, session: SessionDep, response: Response) -> dict[str, object]:
    """Wait (up to 60 s) for the child to tap their card, move their data onto it, then log out.

    Only a tap that happens *after* this request starts counts. Cancel with /nfc/logout/cancel.
    """
    assert user.id is not None
    cancel = threading.Event()
    with _pending_lock:
        if old := _pending_logouts.get(user.id):
            old.set()
        _pending_logouts[user.id] = cancel
    try:
        uid = wait_for_card_tap(cancel, TAP_WAIT_SECONDS)
        require_own_card(session, user.id, uid)
        session.commit()
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


def _user_for_tag(session: SessionDep, tag: Tag) -> int:
    """Who this card logs in. Saved data on the card comes back first; otherwise the linked child."""
    try:
        save = vault.read_card(tag)
    except NfcError:
        save = None  # unreadable memory (e.g. a locked MIFARE sector): the uid alone still works
    if save is not None:
        if vault.is_live(session, save):
            return vault.move_from_card(session, tag)
        try:
            vault.wipe_card(tag)  # stale copy of an old save: clean it up, then log in by uid
        except NfcError:
            pass
    child_id = child_for_card(session, tag.uid.hex())
    if child_id is None:
        raise NfcError("This card isn't linked to anyone yet. Log in and pay with it once to link it.")
    return child_id


@router.post("/login", response_model=UserPublic)
def login_with_card(session: SessionDep, request: Request, response: Response) -> User:
    """Log in with the card on the reader (only when nobody is logged in). Child accounts only."""
    if get_current_user_or_none(request, session) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already logged in. Tapping a card does nothing while logged in.")
    if hub.tap_seq == hub.consumed_seq:
        raise HTTPException(status.HTTP_409_CONFLICT, "Lift the card and tap again to log in.")
    user_id = _on_card(lambda tag: _user_for_tag(session, tag))
    user = get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This card belongs to an account that no longer exists.")
    if user.role != "child":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cards are for child accounts. Log in with your password.")
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
