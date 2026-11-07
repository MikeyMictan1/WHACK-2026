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
from app.controllers.nfc_controller import hub
from app.controllers.shop_controller import TAP_TIMEOUT_SECONDS, _check_card
from app.core.config import settings
from app.core.database import SessionDep
from app.models.card import Card, get_card, get_profile
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


class PayIn(BaseModel):
    amount: int = Field(ge=1, le=100_000_000)  # minor units
    simulate: bool = False


class PayOut(BaseModel):
    summary: CreditSummary
    paid: int
    cash_back: int


class ChildCredit(BaseModel):
    child_id: int
    child_name: str
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
    return user.display_name or user.username


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
    else:
        if hub.reader_name is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No card reader connected. Use Simulate tap.")
        cancel_flag = threading.Event()
        with _waiting_lock:
            if old := _waiting.get(child.id):
                old.set()
            _waiting[child.id] = cancel_flag
        try:
            seq = hub.wait_for_tap(hub.tap_seq, cancel_flag, TAP_TIMEOUT_SECONDS)
        finally:
            with _waiting_lock:
                if _waiting.get(child.id) is cancel_flag:
                    del _waiting[child.id]
        if seq is None or hub.current_uid is None:
            raise HTTPException(status.HTTP_408_REQUEST_TIMEOUT, "No card tapped. Try again.")
        _check_card(session, child.id, hub.current_uid)

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
    )
