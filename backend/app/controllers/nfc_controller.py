"""NFC: card taps and card memory (ACR122U or any PC/SC reader).

Browsers can't talk to PC/SC readers, so the backend does. The reader is either plugged into
this machine (core/nfc_hub.py polls it) or into a laptop running the bridge, which connects to
/api/nfc/bridge when the backend runs in the cloud (core/bridge_link.py). Either way taps
reach the frontend over Server-Sent Events at /api/nfc/events:

  {"type": "reader", "connected": true,  "name": "ACS ACR122U ..."}
  {"type": "reader", "connected": false}
  {"type": "card",   "uid": "04A1B2C3D4E5F6"}
  {"type": "card_removed"}

A tap only does something when a screen is asking for one. Cards belong to child accounts:

  pay            shop_controller.pay waits for a tap; the card must be the child's (first card links).
                 After a reader tap the card also gets a receipt saved on it (`save_receipt`)
  switch plan    negotiation_controller.confirm, same card check
  save data      POST /api/nfc/logout: the child's vault moves onto their card, then log out
                 (POST /api/nfc/logout/cancel is the "Back" button while waiting)
  log in         POST /api/nfc/login (nobody logged in): a card holding saved data restores it;
                 otherwise a card linked to a child logs that child in

Every screen that waits for a tap goes through `wait_for_card_tap`, so the same rules apply
whichever reader the tap came from.
"""

import asyncio
import hmac
import json
import threading
import time
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.controllers.auth_controller import _set_auth_cookie
from app.controllers.deps import CurrentChild, CurrentUser, get_current_user_or_none
from app.core.config import settings
from app.core.database import SessionDep, engine
from app.core.bridge_link import RemoteTag, bridge
from app.core.nfc_card import NfcError, Tag, card_lock, close_tag, open_tag
from app.core.nfc_hub import NfcHub
from sqlmodel import Session

from app.models import vault
from app.models.shop import CardError, check_card, child_for_card, normalize_uid
from app.models.user import User, UserPublic, get_user_by_id

router = APIRouter(prefix="/nfc", tags=["nfc"])

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


def phone_tap_uid(card_uid: str) -> str:
    """A card id read by the phone (Web NFC, e.g. '04:a2:3b:...'), checked and normalised."""
    if not settings.allow_phone_tap:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tapping on a phone is turned off.")
    uid = normalize_uid(card_uid)
    if not 8 <= len(uid) <= 20 or any(c not in "0123456789ABCDEF" for c in uid):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That doesn't look like a card id.")
    return uid


def require_own_card(session: SessionDep, child_id: int, uid: str) -> None:
    """check_card as an HTTP error. Links the child's first card (the caller commits)."""
    try:
        check_card(session, child_id, uid)
    except CardError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e)) from e


@router.get("/status")
def nfc_status() -> dict[str, object]:
    via = "local" if hub.local_reader else "bridge" if hub.bridge_reader else None
    return {"connected": hub.reader_name is not None, "name": hub.reader_name, "via": via, "bridge": bridge.connected}


# ---- the laptop bridge -----------------------------------------------------------

@router.websocket("/bridge")
async def bridge_socket(ws: WebSocket) -> None:
    """The laptop bridge (`python -m app.bridge`) connects here. Needs BRIDGE_TOKEN."""
    token = ws.query_params.get("token") or ""
    if not settings.bridge_token or not hmac.compare_digest(token, settings.bridge_token):
        await ws.close(code=1008, reason="Bad or missing bridge token")
        return
    await ws.accept()
    if old := bridge.attach(ws):
        try:
            await old.close(code=1012, reason="Another bridge connected")
        except Exception:
            pass
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            kind = msg.get("type")
            if kind == "reader":
                hub.set_reader(msg.get("name") or None, bridge=True)
            elif kind == "card":
                hub.card_seen(normalize_uid(str(msg.get("uid") or "")) or None)
            elif kind == "card_removed":
                hub.card_seen(None)
            elif kind == "board":
                bridge.board = {
                    "connected": bool(msg.get("connected")),
                    "port": msg.get("port"),
                    "fast": bool(msg.get("fast")),
                }
            elif kind == "reply":
                bridge.got_reply(msg)
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        if bridge.detach(ws):
            hub.set_reader(None, bridge=True)


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


@contextmanager
def _open_card() -> Iterator[Tag | RemoteTag]:
    """The card on whichever reader is in use: plugged in here, or on the laptop bridge.
    Holds card_lock throughout. Raises NfcError."""
    with card_lock:
        if hub.local_reader:
            tag: Tag | RemoteTag = open_tag()
            try:
                yield tag
            finally:
                close_tag(tag)
        elif bridge.connected:
            tag = RemoteTag(bridge)
            try:
                yield tag
            finally:
                tag.close()
        else:
            raise NfcError("No NFC reader plugged in.")


def _on_card[T](action: Callable[[Tag | RemoteTag], T]) -> T:
    try:
        with _open_card() as tag:
            return action(tag)
    except NfcError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e


def save_receipt(child_id: int, uid: str, item: str, amount: int) -> None:
    """After a reader tap pays for something, save a copy of the account on the card: what was paid,
    the balance and what is owed. Best effort in the background: the payment is already done, so a card
    lifted too soon or a reader error only means no receipt. Phone taps can't write, so they skip this."""

    def run() -> None:
        from app.models.card import get_profile  # card imports shop, which this module also uses
        from app.models.clock import site_now
        from app.models.shop import balance_of

        try:
            with Session(engine) as session:
                profile = get_profile(session, child_id)
                data = {
                    "item": item[:24],
                    "paid": amount,
                    "balance": balance_of(session, child_id),
                    "owed": profile.balance,
                    "on": site_now().date().isoformat(),
                }
                with _open_card() as tag:
                    if normalize_uid(tag.uid.hex()) != normalize_uid(uid):
                        return  # a different card is on the reader now
                    vault.write_receipt(session, tag, child_id, data)
        except Exception:  # noqa: BLE001 - never let a receipt break anything
            pass

    threading.Thread(target=run, name="nfc-receipt", daemon=True).start()


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


def _user_for_tag(session: SessionDep, tag: Tag | RemoteTag) -> int:
    """Who this card logs in. Saved data on the card comes back first; otherwise the linked child."""
    try:
        save = vault.read_card(tag)
    except NfcError:
        save = None  # unreadable memory (e.g. a locked MIFARE sector): the uid alone still works
    if save is not None and save.kind == "vault":
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


class PhoneTapIn(BaseModel):
    uid: str = Field(min_length=4, max_length=60)


@router.post("/login/phone", response_model=UserPublic)
def login_with_phone_tap(body: PhoneTapIn, session: SessionDep, request: Request, response: Response) -> User:
    """Log in by tapping a linked card on an Android phone (nobody logged in). Child accounts only.

    The phone can't read saved data ("Log out with NFC" is reader-only), so this logs in the child
    the card is linked to."""
    if get_current_user_or_none(request, session) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already logged in.")
    child_id = child_for_card(session, phone_tap_uid(body.uid))
    user = get_user_by_id(session, child_id) if child_id is not None else None
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This card isn't linked to anyone yet. Log in and pay with it once to link it.")
    if user.role != "child":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cards are for child accounts. Log in with your password.")
    _set_auth_cookie(response, user)
    return user


@router.get("/card")
def card_info(session: SessionDep) -> dict[str, object]:
    """What's on the reader right now (handy for debugging)."""
    try:
        with _open_card() as tag:
            try:
                save = vault.read_card(tag)
            except NfcError as e:
                return {"present": True, "uid": tag.uid.hex().upper(), "message": str(e)}
            return {
                "present": True,
                "type": tag.type,
                "uid": tag.uid.hex().upper(),
                "capacity": tag.capacity,
                "max_data_bytes": tag.capacity - vault.OVERHEAD,
                "holds_data": bool(save and vault.is_live(session, save)),
                "receipt": save.data if save and save.kind == "receipt" else None,
            }
    except NfcError as e:
        return {"present": False, "message": str(e)}
