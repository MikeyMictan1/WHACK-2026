"""A child's negotiation with a card's seller bot, and the switch that follows it.

Status: active -> agreed (child accepted the best offer) -> confirmed (card tapped, plan switched).
        active/agreed -> declined (walked away) or expired.
The final APR is always `best_offer_bp`, which only `record_offer` can change, so what the bot
says in the chat can never change what the child is charged.
"""

from datetime import UTC, datetime, timedelta

from sqlmodel import Field, Session, SQLModel, select

from app.models.clock import site_now
from app.models.card import Card, CreditProfile, allowed_ids, card_limit_for
from app.models.pricing import blocked_reason, ceiling_apr_bp, clamp_offer

MAX_TURNS = 8
EXPIRY = timedelta(minutes=30)


def _now() -> datetime:
    return site_now()  # the site clock, not real time


# ---- Tables ----------------------------------------------------------------

class NegotiationSession(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    from_card_id: str
    from_apr_bp: int  # the child's APR before the switch, for the before/after comparison
    to_card_id: str
    listed_apr_bp: int
    floor_apr_bp: int  # private: never returned by the API
    best_offer_bp: int
    penalty_step_bp: int = 100  # how hard this card punishes rudeness (copied from the card)
    max_penalty_bp: int = 300
    status: str = "active"
    turns_used: int = 0
    max_turns: int = MAX_TURNS
    scripted: bool = False  # True if any reply came from the offline fallback bot
    coach_note: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class NegotiationMessage(SQLModel, table=True):
    """One row per message so a parent can read the whole transcript."""

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="negotiationsession.id", index=True)
    role: str  # "child" | "seller"
    text: str
    offer_apr_bp: int | None = None  # the recorded offer after this message
    created_at: datetime = Field(default_factory=_now)


# ---- Data access -----------------------------------------------------------

def get_session_for(db: Session, user_id: int, session_id: int) -> NegotiationSession | None:
    neg = db.get(NegotiationSession, session_id)
    if neg is None or neg.user_id != user_id:
        return None
    _expire_if_old(db, neg)
    return neg


def _expire_if_old(db: Session, neg: NegotiationSession) -> None:
    created = neg.created_at if neg.created_at.tzinfo else neg.created_at.replace(tzinfo=UTC)
    if neg.status in ("active", "agreed") and _now() - created > EXPIRY:
        neg.status = "expired"
        db.add(neg)
        db.commit()


def messages_of(db: Session, session_id: int) -> list[NegotiationMessage]:
    query = select(NegotiationMessage).where(NegotiationMessage.session_id == session_id)
    return list(db.exec(query.order_by(NegotiationMessage.id)))  # type: ignore[arg-type]


def add_message(
    db: Session, neg: NegotiationSession, role: str, text: str, offer_bp: int | None = None
) -> NegotiationMessage:
    msg = NegotiationMessage(session_id=neg.id or 0, role=role, text=text, offer_apr_bp=offer_bp)
    db.add(msg)
    neg.updated_at = _now()
    db.add(neg)
    db.commit()
    db.refresh(msg)
    return msg


def start_session(db: Session, profile: CreditProfile, card: Card, floor_bp: int) -> NegotiationSession:
    """Begin (or resume) a negotiation for this card. Anything still open for the child is closed."""
    open_ones = list(
        db.exec(
            select(NegotiationSession).where(
                NegotiationSession.user_id == profile.user_id,
                NegotiationSession.status.in_(["active", "agreed"]),  # type: ignore[attr-defined]
            )
        )
    )
    for old in open_ones:
        _expire_if_old(db, old)
        if old.status in ("active", "agreed") and old.to_card_id == card.id and card.negotiable:
            return old  # resume
        if old.status in ("active", "agreed"):
            old.status = "declined"
            db.add(old)
    db.commit()

    negotiable = card.negotiable
    neg = NegotiationSession(
        user_id=profile.user_id,
        from_card_id=profile.current_card_id,
        from_apr_bp=profile.current_apr_bp,
        to_card_id=card.id,
        listed_apr_bp=card.listed_apr_bp,
        floor_apr_bp=floor_bp if negotiable else card.listed_apr_bp,
        best_offer_bp=card.listed_apr_bp,
        penalty_step_bp=card.penalty_step_bp,
        max_penalty_bp=card.max_penalty_bp,
        status="active" if negotiable else "agreed",  # a card with nothing to haggle over skips to confirm
    )
    db.add(neg)
    db.commit()
    db.refresh(neg)
    return neg


def record_offer(db: Session, neg: NegotiationSession, requested_bp: int) -> int:
    """Record the bot's offer (lower for good reasons, higher for rudeness) after clamping it. Returns the offer now on the table."""
    offer = clamp_offer(
        requested_bp,
        listed_bp=neg.listed_apr_bp,
        floor_bp=neg.floor_apr_bp,
        best_bp=neg.best_offer_bp,
        ceiling_bp=ceiling_apr_bp(neg.listed_apr_bp, neg.max_penalty_bp),
        penalty_step_bp=neg.penalty_step_bp,
    )
    neg.best_offer_bp = offer
    db.add(neg)
    db.commit()
    return offer


def accept(db: Session, neg: NegotiationSession) -> NegotiationSession:
    if neg.status == "active":
        neg.status = "agreed"
        neg.updated_at = _now()
        db.add(neg)
        db.commit()
    return neg


def walk_away(db: Session, neg: NegotiationSession) -> None:
    if neg.status in ("active", "agreed"):
        neg.status = "declined"
        db.add(neg)
        db.commit()


def confirm_switch(db: Session, neg: NegotiationSession, profile: CreditProfile, card: Card) -> str | None:
    """Switch the child's plan to the agreed card and APR. Returns an error message, or None on success.

    Re-checks everything, because the profile may have changed since the negotiation started.
    """
    if neg.status == "confirmed":
        return None  # a double click or retry: already done
    if neg.status != "agreed":
        return "This negotiation is not ready to confirm. Accept an offer first."
    if neg.best_offer_bp < neg.floor_apr_bp or neg.best_offer_bp > ceiling_apr_bp(neg.listed_apr_bp, neg.max_penalty_bp):
        return "That offer is not valid."
    if profile.current_card_id == card.id:
        return "You are already on this plan."
    limit = card_limit_for(db, card, profile.user_id)
    reason = blocked_reason(profile, card, allowed_ids(profile), limit=limit)
    if reason:
        return reason

    profile.current_card_id = card.id
    profile.current_apr_bp = neg.best_offer_bp
    profile.credit_limit = limit
    profile.last_switch_cycle = profile.cycles_done  # one change per month: the next waits for a statement
    neg.status = "confirmed"
    neg.updated_at = _now()
    db.add(profile)
    db.add(neg)
    db.commit()
    return None
