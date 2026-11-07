"""Negotiate a new card with its seller bot, then confirm the switch with an NFC tap.

  POST /plans/{card_id}/negotiations      start or resume (Debit skips straight to "agreed")
  GET  /negotiations/{id}                 the session and its messages
  POST /negotiations/{id}/messages        the child says something; the bot answers
  POST /negotiations/{id}/accept          take the best offer on the table
  POST /negotiations/{id}/confirm         tap the card (or simulate it): the plan switches
  POST /negotiations/{id}/confirm/cancel  the "Back" button while waiting for the tap
  POST /negotiations/{id}/walk-away       leave without switching

The browser never receives the floor APR. The final APR is `best_offer_bp`, set only by the backend.
"""

import threading

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from app.controllers.deps import CurrentChild
from app.controllers.nfc_controller import hub
from app.controllers.plans_controller import CurrentPlan, current_plan
from app.core import led_feedback, seller_bot
from app.core.config import settings
from app.core.database import SessionDep
from app.models import negotiation as neg_model
from app.models.card import Card, CreditProfile, allowed_ids, get_card, get_profile
from app.models.negotiation import NegotiationSession
from app.models.pricing import blocked_reason, floor_apr_bp, twelve_month_cost

router = APIRouter(tags=["negotiation"])

TAP_WAIT_SECONDS = 60
_waiting: dict[int, threading.Event] = {}
_waiting_lock = threading.Lock()


# ---- schemas ------------------------------------------------------------------------

class MessageOut(BaseModel):
    id: int
    role: str
    text: str
    offer_apr_bp: int | None


class CostLine(BaseModel):
    card_name: str
    apr_bp: int
    interest: int
    rewards: int
    net: int


class SessionOut(BaseModel):
    id: int
    card_id: str
    card_name: str
    seller: str
    status: str
    listed_apr_bp: int
    offer_apr_bp: int
    discount_bp: int
    progress: float  # 0..1 of the available discount won (shown as a bar; the floor itself stays private)
    turns_used: int
    max_turns: int
    scripted: bool
    messages: list[MessageOut]
    before: CostLine | None = None  # filled once an offer is accepted
    after: CostLine | None = None
    coach_note: str | None = None


class SayIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class ConfirmIn(BaseModel):
    simulate: bool = False


class ConfirmOut(BaseModel):
    session: SessionOut
    plan: CurrentPlan


# ---- helpers ----------------------------------------------------------------------------

def _load(db: SessionDep, child_id: int, session_id: int) -> NegotiationSession:
    neg = neg_model.get_session_for(db, child_id, session_id)
    if neg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Negotiation not found")
    return neg


def _card_of(db: SessionDep, neg: NegotiationSession) -> Card:
    card = get_card(db, neg.to_card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


def _progress(neg: NegotiationSession) -> float:
    available = neg.listed_apr_bp - neg.floor_apr_bp
    if available <= 0:
        return 0.0
    return max(0.0, (neg.listed_apr_bp - neg.best_offer_bp) / available)  # a rate above listed shows 0


def _cost(profile: CreditProfile, card: Card, apr_bp: int) -> CostLine:
    c = twelve_month_cost(profile, card, apr_bp)
    return CostLine(card_name=card.name, apr_bp=apr_bp, interest=c.interest, rewards=c.rewards, net=c.net)


def _out(db: SessionDep, neg: NegotiationSession, profile: CreditProfile) -> SessionOut:
    card = _card_of(db, neg)
    before = after = None
    if neg.status in ("agreed", "confirmed"):
        from_card = get_card(db, neg.from_card_id)
        if from_card is not None:
            before = _cost(profile, from_card, neg.from_apr_bp)
        after = _cost(profile, card, neg.best_offer_bp)
    return SessionOut(
        id=neg.id or 0,
        card_id=card.id,
        card_name=card.name,
        seller=card.seller,
        status=neg.status,
        listed_apr_bp=neg.listed_apr_bp,
        offer_apr_bp=neg.best_offer_bp,
        discount_bp=neg.listed_apr_bp - neg.best_offer_bp,
        progress=_progress(neg),
        turns_used=neg.turns_used,
        max_turns=neg.max_turns,
        scripted=neg.scripted,
        messages=[
            MessageOut(id=m.id or 0, role=m.role, text=m.text, offer_apr_bp=m.offer_apr_bp)
            for m in neg_model.messages_of(db, neg.id or 0)
        ],
        before=before,
        after=after,
        coach_note=neg.coach_note,
    )


# ---- routes -----------------------------------------------------------------------------

@router.post("/plans/{card_id}/negotiations")
def start_negotiation(card_id: str, child: CurrentChild, db: SessionDep, bg: BackgroundTasks) -> SessionOut:
    assert child.id is not None
    profile = get_profile(db, child.id)
    card = get_card(db, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    reason = blocked_reason(profile, card, allowed_ids(profile))
    if reason:
        raise HTTPException(status.HTTP_409_CONFLICT, reason)

    neg = neg_model.start_session(db, profile, card, floor_apr_bp(profile, card))
    if card.negotiable and not neg_model.messages_of(db, neg.id or 0):
        neg_model.add_message(db, neg, "seller", seller_bot.opening_message(card), neg.best_offer_bp)
        bg.add_task(led_feedback.show_progress, _progress(neg))
    return _out(db, neg, profile)


@router.get("/negotiations/{session_id}")
def get_negotiation(session_id: int, child: CurrentChild, db: SessionDep) -> SessionOut:
    assert child.id is not None
    return _out(db, _load(db, child.id, session_id), get_profile(db, child.id))


@router.post("/negotiations/{session_id}/messages")
def say(session_id: int, body: SayIn, child: CurrentChild, db: SessionDep, bg: BackgroundTasks) -> SessionOut:
    assert child.id is not None
    neg = _load(db, child.id, session_id)
    if neg.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, "This negotiation is over.")
    if neg.turns_used >= neg.max_turns:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are out of messages. Accept the offer or walk away.")

    profile = get_profile(db, child.id)
    card = _card_of(db, neg)
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Say something first.")

    history = [(m.role, m.text) for m in neg_model.messages_of(db, neg.id or 0)]
    seen = {m.offer_apr_bp for m in neg_model.messages_of(db, neg.id or 0) if m.offer_apr_bp is not None}
    neg_model.add_message(db, neg, "child", text)
    neg.turns_used += 1
    db.add(neg)
    db.commit()

    def record(requested_bp: int) -> tuple[int, bool]:
        offer = neg_model.record_offer(db, neg, requested_bp)
        return offer, offer <= neg.floor_apr_bp

    turns_left = neg.max_turns - neg.turns_used
    try:
        reply = seller_bot.claude_reply(
            profile, card, age=child.age, best_bp=neg.best_offer_bp, turns_left=turns_left,
            history=history, child_text=text, seen_offers_bp=seen, record=record,
        )
    except HTTPException:
        # No key, rate limit or API down: a scripted bot keeps the demo alive.
        reply = seller_bot.scripted_reply(
            card, best_bp=neg.best_offer_bp, turns_left=turns_left,
            earlier_child_texts=[t for r, t in history if r == "child"], child_text=text, record=record,
        )
    if reply.scripted:
        neg.scripted = True
    neg_model.add_message(db, neg, "seller", reply.text, neg.best_offer_bp)
    bg.add_task(led_feedback.show_progress, _progress(neg))
    return _out(db, neg, profile)


@router.post("/negotiations/{session_id}/accept")
def accept_offer(session_id: int, child: CurrentChild, db: SessionDep) -> SessionOut:
    assert child.id is not None
    neg = _load(db, child.id, session_id)
    if neg.status not in ("active", "agreed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This negotiation is over.")
    profile = get_profile(db, child.id)
    card = _card_of(db, neg)
    neg_model.accept(db, neg)
    if neg.coach_note is None:
        neg.coach_note = seller_bot.coach_note(profile, card, neg.best_offer_bp, child.age)
        db.add(neg)
        db.commit()
    return _out(db, neg, profile)


@router.post("/negotiations/{session_id}/walk-away")
def walk_away(session_id: int, child: CurrentChild, db: SessionDep) -> SessionOut:
    assert child.id is not None
    neg = _load(db, child.id, session_id)
    neg_model.walk_away(db, neg)
    _cancel_wait(neg.id or 0)
    return _out(db, neg, get_profile(db, child.id))


@router.post("/negotiations/{session_id}/confirm")
def confirm(session_id: int, body: ConfirmIn, child: CurrentChild, db: SessionDep, bg: BackgroundTasks) -> ConfirmOut:
    """Wait (up to 60 s) for a card tap, then switch the plan. `simulate` skips the tap in dev builds."""
    assert child.id is not None
    neg = _load(db, child.id, session_id)
    profile = get_profile(db, child.id)
    card = _card_of(db, neg)

    if neg.status != "confirmed":
        if neg.status != "agreed":
            raise HTTPException(status.HTTP_409_CONFLICT, "Accept an offer first.")
        if body.simulate:
            if not settings.allow_simulated_tap:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Simulated taps are turned off.")
        else:
            _wait_for_tap(neg.id or 0)

        db.refresh(neg)  # it may have changed while we waited
        error = neg_model.confirm_switch(db, neg, profile, card)
        if error:
            raise HTTPException(status.HTTP_409_CONFLICT, error)
        bg.add_task(led_feedback.show_switched)

    db.refresh(profile)
    return ConfirmOut(session=_out(db, neg, profile), plan=current_plan(profile, db))


@router.post("/negotiations/{session_id}/confirm/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_confirm(session_id: int, child: CurrentChild, db: SessionDep) -> None:
    assert child.id is not None
    _load(db, child.id, session_id)
    _cancel_wait(session_id)


# ---- tap waiting (same pattern as "Log out with NFC") ---------------------------------------

def _cancel_wait(session_id: int) -> None:
    with _waiting_lock:
        if event := _waiting.get(session_id):
            event.set()


def _wait_for_tap(session_id: int) -> None:
    if hub.reader_name is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No NFC reader is connected. Plug it in, or use the simulate button.",
        )
    cancel = threading.Event()
    with _waiting_lock:
        if old := _waiting.get(session_id):
            old.set()
        _waiting[session_id] = cancel
    try:
        seq = hub.wait_for_tap(hub.tap_seq, cancel, TAP_WAIT_SECONDS)
        if seq is None:
            if cancel.is_set():
                raise HTTPException(499, "Cancelled.")
            raise HTTPException(status.HTTP_408_REQUEST_TIMEOUT, "No card was tapped. Try again.")
        hub.consumed_seq = seq
    finally:
        with _waiting_lock:
            if _waiting.get(session_id) is cancel:
                del _waiting[session_id]

