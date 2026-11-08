"""The credit core's API: the child's card summary, paying a statement, and the parent's "Skip a month".

  GET  /api/credit                                 the child's card, statement and activity
  POST /api/credit/payments                        pay the open statement (tap the NFC card, or simulate)
  POST /api/credit/payments/cancel                 the "Back" button while waiting for the tap
  GET  /api/credit/children                        parent: each child's card at a glance
  POST /api/credit/children/{child_id}/skip-month  parent: move that child's clock on one month

The rules live in models/credit.py (see its docstring).
"""

import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, col, select

from app.controllers.deps import CurrentChild, CurrentParent
from app.controllers.nfc_controller import (
    phone_tap_uid,
    require_own_card,
    wait_for_card_tap,
)
from app.controllers.shop_controller import TAP_TIMEOUT_SECONDS
from app.core.config import settings
from app.core.database import SessionDep
from app.models.card import Card, CreditProfile, get_card, get_profile, list_cards
from app.models.credit import (
    CYCLE_DAYS,
    EXAMPLE_BALANCE,
    GRACE_DAYS,
    MIN_PAYMENT_FLOOR,
    MIN_PAYMENT_PERCENT,
    CreditEntry,
    CreditError,
    Statement,
    advance_month,
    available_credit,
    aware,
    interest_for,
    is_credit,
    latest_statement,
    open_statement,
    pay_statement,
    remaining_on,
    unbilled_purchases,
)
from app.models.pricing import switch_locked_reason
from app.models.score import (
    FACTOR_NAMES,
    HISTORY_FULL_MONTHS,
    HISTORY_MAX,
    PAYMENT_MAX,
    SCORE_MAX,
    SCORE_MIN,
    UTILISATION_MAX,
    ScoreEvent,
    band_of,
    score_enabled,
)
from app.models.shop import balance_of
from app.models.user import User, get_child, list_children

router = APIRouter(prefix="/credit", tags=["credit"])

_waiting: dict[int, threading.Event] = {}  # child id -> cancel flag for a payment waiting on a tap
_waiting_lock = threading.Lock()


# ---- schemas ----------------------------------------------------------------------

class CardInfo(BaseModel):
    id: str
    name: str
    apr_bp: int
    credit_limit: int
    rewards_bp: int
    late_fee: int


class StatementOut(BaseModel):
    id: int
    number: int
    card_name: str
    apr_bp: int
    statement_date: datetime
    due_date: datetime
    carried: int
    purchases: int
    interest: int
    fees: int
    total: int
    minimum: int
    paid: int
    remaining: int
    cash_back: int
    cash_back_paid: bool
    status: str  # open | paid | carried | late


class EntryOut(BaseModel):
    id: int
    amount: int
    kind: str
    description: str
    on_date: datetime


class ScoreFactor(BaseModel):
    key: str  # payment | utilisation | history
    name: str
    points: int
    max_points: int
    note: str


class ScoreReason(BaseModel):
    factor: str
    factor_name: str
    delta: int
    reason: str


class ScorePoint(BaseModel):
    month: int  # 0 is where the account started
    score: int
    date: datetime


class NextUnlock(BaseModel):
    card_name: str
    min_score: int
    points_needed: int


class ScoreInfo(BaseModel):
    score: int
    min_score: int
    max_score: int
    band: str
    change: int | None  # last month's change; None before the first statement
    factors: list[ScoreFactor]  # how the score is made up right now
    reasons: list[ScoreReason]  # why it moved last month
    history: list[ScorePoint]  # oldest first, from where the account started
    next_unlock: NextUnlock | None  # the closest card the score does not reach yet


class CreditSummary(BaseModel):
    card: CardInfo
    has_credit: bool
    owed: int
    limit: int
    available: int
    utilisation_pct: int
    unbilled: int  # purchases made since the last statement
    sim_date: datetime
    next_statement_date: datetime
    statement: StatementOut | None  # the latest statement
    can_pay: bool
    statements: list[StatementOut]  # newest first, the latest included
    activity: list[EntryOut]
    wallet_balance: int
    example_balance: int  # "this is what it would cost at real-life size"
    example_interest: int
    switch_locked_reason: str | None
    grace_days: int
    min_payment_percent: int
    min_payment_floor: int
    score_enabled: bool  # the parent's setting: is credit score tracking on for this child?
    score: ScoreInfo | None  # None when tracking is off


class PayIn(BaseModel):
    amount: int = Field(ge=1, le=100_000_000)  # minor units
    simulate: bool = False
    card_uid: str | None = Field(default=None, max_length=60)  # tapped on an Android phone (Web NFC)


class PayOut(BaseModel):
    summary: CreditSummary
    paid: int
    cash_back: int


class ChildCredit(BaseModel):
    child_id: int
    child_name: str
    card_id: str
    card_name: str
    has_credit: bool
    owed: int
    available: int
    sim_date: datetime
    statement_number: int | None
    statement_total: int | None
    statement_remaining: int | None
    due_date: datetime | None
    status: str | None
    score: int | None  # None when the child's score tracking is off
    score_change: int | None  # last month's change


class SkipOut(BaseModel):
    child_id: int
    child_name: str
    sim_date: datetime
    allowance: int
    previous_number: int | None
    outcome: str | None  # paid | carried | late
    interest: int
    late_fee: int
    statement: StatementOut | None
    score_enabled: bool = False
    score_before: int | None = None  # only when the child's score tracking is on
    score_after: int | None = None
    score_changes: list[ScoreReason] = []


# ---- builders ---------------------------------------------------------------------

def _statement_out(session: Session, s: Statement) -> StatementOut:
    assert s.id is not None
    card = session.get(Card, s.card_id)
    return StatementOut(
        id=s.id, number=s.number, card_name=card.name if card else s.card_id, apr_bp=s.apr_bp,
        statement_date=s.statement_date, due_date=s.due_date, carried=s.carried, purchases=s.purchases,
        interest=s.interest, fees=s.fees, total=s.total, minimum=s.minimum, paid=s.paid, remaining=remaining_on(s),
        cash_back=s.cash_back, cash_back_paid=s.cash_back_paid, status=s.status,
    )


def _display_name(user: User) -> str:
    return user.username


def _reason(factor: str, delta: int, reason: str) -> ScoreReason:
    return ScoreReason(factor=factor, factor_name=FACTOR_NAMES.get(factor, factor), delta=delta, reason=reason)


def _latest_change(session: Session, child_id: int) -> int | None:
    """How much the score moved in the most recent month that touched it."""
    last = session.exec(select(ScoreEvent).where(ScoreEvent.child_id == child_id).order_by(col(ScoreEvent.id).desc())).first()
    if last is None:
        return None
    rows = session.exec(select(ScoreEvent).where(ScoreEvent.child_id == child_id, ScoreEvent.month == last.month)).all()
    return sum(e.delta for e in rows)


def build_score_info(session: Session, profile: CreditProfile) -> ScoreInfo:
    events = session.exec(
        select(ScoreEvent).where(ScoreEvent.child_id == profile.user_id).order_by(col(ScoreEvent.month), col(ScoreEvent.id))
    ).all()
    by_month: dict[int, list[ScoreEvent]] = {}
    for e in events:
        by_month.setdefault(e.month, []).append(e)
    months = sorted(by_month)
    latest = by_month[months[-1]] if months else []

    history: list[ScorePoint] = []
    if months:
        first = by_month[months[0]]
        start = first[0].score_after - sum(e.delta for e in first)  # the score before the first month was measured
        history.append(ScorePoint(month=0, score=start, date=aware(profile.opened_at or first[0].on_date)))
        history += [ScorePoint(month=m, score=by_month[m][-1].score_after, date=aware(by_month[m][-1].on_date)) for m in months]

    locked = [c for c in list_cards(session) if c.min_score > profile.score]
    nearest = min(locked, key=lambda c: c.min_score) if locked else None
    return ScoreInfo(
        score=profile.score,
        min_score=SCORE_MIN,
        max_score=SCORE_MAX,
        band=band_of(profile.score),
        change=sum(e.delta for e in latest) if latest else None,
        factors=[
            ScoreFactor(
                key="payment", name=FACTOR_NAMES["payment"], points=profile.score_payment, max_points=PAYMENT_MAX,
                note="The biggest part. Paying on time builds it slowly; a late payment costs a lot.",
            ),
            ScoreFactor(
                key="utilisation", name=FACTOR_NAMES["utilisation"], points=profile.score_utilisation,
                max_points=UTILISATION_MAX, note="How much of your limit you use on statement day. Under 10% is best.",
            ),
            ScoreFactor(
                key="history", name=FACTOR_NAMES["history"], points=profile.score_history, max_points=HISTORY_MAX,
                note=f"How long you have had your account: {profile.months_open} of {HISTORY_FULL_MONTHS} months for full marks.",
            ),
        ],
        reasons=[_reason(e.factor, e.delta, e.reason) for e in latest],
        history=history[-13:],
        next_unlock=(
            NextUnlock(card_name=nearest.name, min_score=nearest.min_score, points_needed=nearest.min_score - profile.score)
            if nearest
            else None
        ),
    )


def build_summary(session: Session, child: User) -> CreditSummary:
    assert child.id is not None
    profile = get_profile(session, child.id)
    card = get_card(session, profile.current_card_id)
    assert card is not None
    assert profile.sim_now is not None  # get_profile always sets the child's clock
    sim_now = aware(profile.sim_now)
    statements = session.exec(
        select(Statement).where(Statement.child_id == child.id).order_by(col(Statement.number).desc()).limit(6)
    ).all()
    entries = session.exec(
        select(CreditEntry).where(CreditEntry.child_id == child.id).order_by(col(CreditEntry.id).desc()).limit(12)
    ).all()
    credit = is_credit(profile)
    return CreditSummary(
        card=CardInfo(
            id=card.id, name=card.name, apr_bp=profile.current_apr_bp, credit_limit=profile.credit_limit,
            rewards_bp=card.rewards_bp, late_fee=card.late_fee,
        ),
        has_credit=credit,
        owed=profile.balance,
        limit=profile.credit_limit,
        available=available_credit(profile),
        utilisation_pct=round(100 * profile.balance / profile.credit_limit) if credit else 0,
        unbilled=unbilled_purchases(session, child.id),
        sim_date=sim_now,
        next_statement_date=sim_now + timedelta(days=CYCLE_DAYS),
        statement=_statement_out(session, statements[0]) if statements else None,
        can_pay=open_statement(session, child.id) is not None,
        statements=[_statement_out(session, s) for s in statements],
        activity=[
            EntryOut(id=e.id or 0, amount=e.amount, kind=e.kind, description=e.description, on_date=e.on_date)
            for e in entries
        ],
        wallet_balance=balance_of(session, child.id),
        example_balance=EXAMPLE_BALANCE,
        example_interest=interest_for(EXAMPLE_BALANCE, profile.current_apr_bp),
        switch_locked_reason=switch_locked_reason(profile),
        grace_days=GRACE_DAYS,
        min_payment_percent=MIN_PAYMENT_PERCENT,
        min_payment_floor=MIN_PAYMENT_FLOOR,
        score_enabled=score_enabled(child.app_experience),
        score=build_score_info(session, profile) if score_enabled(child.app_experience) else None,
    )


# ---- child ------------------------------------------------------------------------

@router.get("")
def my_credit(child: CurrentChild, session: SessionDep) -> CreditSummary:
    return build_summary(session, child)


@router.post("/payments")
def pay(body: PayIn, child: CurrentChild, session: SessionDep) -> PayOut:
    """Pay some or all of the open statement from the child's own balance.

    Like buying something, it takes a tap of their NFC card (waits up to 30 s); `simulate` skips it.
    """
    assert child.id is not None
    profile = get_profile(session, child.id)
    if open_statement(session, child.id) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You have no statement to pay right now.")

    if body.simulate:
        if not settings.allow_simulated_tap:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Simulated taps are turned off")
    elif body.card_uid:
        with _waiting_lock:  # stop a reader wait still running for this child
            if old := _waiting.get(child.id):
                old.set()
        require_own_card(session, child.id, phone_tap_uid(body.card_uid))
    else:
        cancel_flag = threading.Event()
        with _waiting_lock:
            if old := _waiting.get(child.id):
                old.set()
            _waiting[child.id] = cancel_flag
        try:
            uid = wait_for_card_tap(cancel_flag, TAP_TIMEOUT_SECONDS)
        finally:
            with _waiting_lock:
                if _waiting.get(child.id) is cancel_flag:
                    del _waiting[child.id]
        require_own_card(session, child.id, uid)

    session.refresh(profile)  # we may have waited a while
    try:
        result = pay_statement(session, profile, body.amount)
    except CreditError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    session.commit()
    return PayOut(summary=build_summary(session, child), paid=result.paid, cash_back=result.cash_back)


@router.post("/payments/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_payment(child: CurrentChild) -> None:
    """Stop waiting for a tap (the "Back" button)."""
    with _waiting_lock:
        if flag := _waiting.get(child.id or -1):
            flag.set()


# ---- parent -----------------------------------------------------------------------

@router.get("/children")
def children_credit(parent: CurrentParent, session: SessionDep) -> list[ChildCredit]:
    assert parent.id is not None
    out = []
    for child in list_children(session, parent.id):
        assert child.id is not None
        profile = get_profile(session, child.id)
        assert profile.sim_now is not None
        card = get_card(session, profile.current_card_id)
        statement = latest_statement(session, child.id)
        out.append(
            ChildCredit(
                child_id=child.id,
                child_name=_display_name(child),
                card_id=profile.current_card_id,
                card_name=card.name if card else profile.current_card_id,
                has_credit=is_credit(profile),
                owed=profile.balance,
                available=available_credit(profile),
                sim_date=aware(profile.sim_now),
                statement_number=statement.number if statement else None,
                statement_total=statement.total if statement else None,
                statement_remaining=remaining_on(statement) if statement else None,
                due_date=statement.due_date if statement else None,
                status=statement.status if statement else None,
                score=profile.score if score_enabled(child.app_experience) else None,
                score_change=_latest_change(session, child.id) if score_enabled(child.app_experience) else None,
            )
        )
    return out


@router.post("/children/{child_id}/skip-month")
def skip_month(child_id: int, parent: CurrentParent, session: SessionDep) -> SkipOut:
    """Move this child's clock on one month: 4 weeks of allowance, the due date passes, interest and any
    late fee are charged, and a new statement is issued."""
    assert parent.id is not None
    child = get_child(session, parent.id, child_id)
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child account not found")
    assert child.id is not None
    profile = get_profile(session, child.id)
    result = advance_month(session, child, profile)
    session.commit()
    return SkipOut(
        child_id=child.id,
        child_name=_display_name(child),
        sim_date=result.sim_date,
        allowance=result.allowance,
        previous_number=result.previous.number if result.previous else None,
        outcome=result.outcome,
        interest=result.interest,
        late_fee=result.late_fee,
        statement=_statement_out(session, result.statement) if result.statement else None,
        score_enabled=score_enabled(child.app_experience),
        score_before=result.score_before if score_enabled(child.app_experience) else None,
        score_after=result.score_after if score_enabled(child.app_experience) else None,
        score_changes=(
            [_reason(c.factor, c.delta, c.reason) for c in result.score_changes] if score_enabled(child.app_experience) else []
        ),
    )
