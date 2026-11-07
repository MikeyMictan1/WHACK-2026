"""The credit core (docs/DESIGN.md section 6.1): spending on credit, statements, payments and months.

How it works
------------
* A child on a credit card spends on the card instead of from their own balance. Each purchase is a
  `CreditEntry` (positive = owed) and raises `CreditProfile.balance`. Nothing else changes `balance`.
* The child has their own simulated clock (`CreditProfile.sim_now`). It only moves when a parent skips a
  month (`advance_month`): one month is 4 weeks, so that is also 4 weekly allowances.
* Skipping a month closes the books: the previous statement's due date passes (paid in full, paid at least
  the minimum, or late), interest and any late fee are charged, and a new `Statement` is issued.
* Each month's close also recalculates the credit score (models/score.py) and saves why it moved.
* The child pays the open statement from their own balance (`pay_statement`).

The rules, all from section 6.1:
  1. Grace period: pay the whole statement by its due date and no interest is charged.
  2. Interest = unpaid part of the previous statement x APR / 12, to the nearest unit, charged on statement day.
  3. Minimum payment = the larger of 1.00 WC and 10% of the statement (never more than the statement).
     Paying less than that by the due date is a late payment: a late fee on cards that have one.
  4. Over the limit: the purchase is declined with the reason.
  5. Cash back is paid after the statement is paid in full by its due date, not at purchase.

Functions here never commit: the caller commits, so a purchase, a payment and their ledger entries
always succeed or fail together.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlmodel import Field, Session, SQLModel, col, func, select

from app.models.card import Card, CreditProfile
from app.models.score import ScoreChange, init_score, update_for_month, utilisation_bp_of
from app.models.shop import add_entry, balance_of
from app.models.user import User

CYCLE_DAYS = 28  # one "month": 4 weeks, so each skipped month pays 4 weekly allowances
GRACE_DAYS = 14  # a statement is due this long after it is issued
ALLOWANCE_WEEKS = 4
MIN_PAYMENT_FLOOR = 100  # 1.00 WC, in minor units
MIN_PAYMENT_PERCENT = 10
EXAMPLE_BALANCE = 100_000  # 1,000.00 WC: "what this would cost at real-life size" (section 6.1, option 2)


def _now() -> datetime:
    return datetime.now(UTC)


def aware(dt: datetime) -> datetime:
    """SQLite can hand datetimes back without a timezone; ours are always UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class CreditError(Exception):
    """A rule was broken (not enough money, nothing to pay...). The message is safe to show the child."""


# ---- Tables ----------------------------------------------------------------

class CreditEntry(SQLModel, table=True):
    """Every change to what a child owes on their card. Positive = owed, negative = paid off."""

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    amount: int
    kind: str  # purchase | interest | late_fee | payment
    description: str = Field(max_length=120)
    cash_back_bp: int = 0  # purchases only: the card's cash back rate when it was bought
    # Charges are tied to the statement they first appear on, payments to the statement they pay.
    statement_id: int | None = Field(default=None, index=True)
    on_date: datetime  # the child's simulated date
    created_at: datetime = Field(default_factory=_now)  # real time, for ordering


class Statement(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    number: int  # 1, 2, 3 ... one per month skipped
    card_id: str
    apr_bp: int  # the APR when it was issued
    late_fee: int  # the card's late fee when it was issued
    statement_date: datetime
    due_date: datetime
    carried: int  # unpaid from the previous statement
    purchases: int
    interest: int
    fees: int
    total: int  # carried + purchases + interest + fees = what is owed on statement day
    minimum: int
    paid: int = 0
    cash_back: int = 0  # earned on this statement's purchases; paid out once it is paid in full on time
    cash_back_paid: bool = False
    # open: waiting for payment | paid: paid in full | carried: due date passed, minimum paid, rest carried
    # over | late: due date passed and the minimum was not paid
    status: str = "open"
    settled: bool = False  # True once its due date has been dealt with by a skipped month
    created_at: datetime = Field(default_factory=_now)


# ---- Pure rules ----------------------------------------------------------------

def minimum_payment(total: int) -> int:
    """The larger of 1.00 WC and 10% of the statement, but never more than the statement itself."""
    if total <= 0:
        return 0
    return min(total, max(MIN_PAYMENT_FLOOR, (total * MIN_PAYMENT_PERCENT + 50) // 100))


def interest_for(carried: int, apr_bp: int) -> int:
    """carried x APR / 12, to the nearest unit (halves round up). 100,000 at 20% -> 1,667 (16.67 WC)."""
    if carried <= 0 or apr_bp <= 0:
        return 0
    return (carried * apr_bp + 60_000) // 120_000  # 120_000 = 10_000 (basis points) x 12 months


def cash_back_for(purchases: list[CreditEntry]) -> int:
    """Each purchase earns its own card's rate; round once over the statement, halves up."""
    return (sum(e.amount * e.cash_back_bp for e in purchases) + 5_000) // 10_000


def remaining_on(statement: Statement) -> int:
    return max(0, statement.total - statement.paid)


# ---- Account state ---------------------------------------------------------------

def is_credit(profile: CreditProfile) -> bool:
    """On a card with a credit limit (not Debit)."""
    return profile.credit_limit > 0


def available_credit(profile: CreditProfile) -> int:
    return max(0, profile.credit_limit - profile.balance) if is_credit(profile) else 0


def latest_statement(session: Session, child_id: int) -> Statement | None:
    return session.exec(
        select(Statement).where(Statement.child_id == child_id).order_by(col(Statement.number).desc())
    ).first()


def open_statement(session: Session, child_id: int) -> Statement | None:
    """The statement that can be paid right now: the latest one, if it is open and still owes something."""
    latest = latest_statement(session, child_id)
    if latest is not None and latest.status == "open" and remaining_on(latest) > 0:
        return latest
    return None


def unbilled_purchases(session: Session, child_id: int) -> int:
    """Purchases made since the last statement."""
    total = session.exec(
        select(func.sum(CreditEntry.amount)).where(
            CreditEntry.child_id == child_id,
            col(CreditEntry.statement_id).is_(None),
            CreditEntry.kind == "purchase",
        )
    ).one()
    return int(total or 0)


def post_entry(
    session: Session,
    profile: CreditProfile,
    *,
    amount: int,
    kind: str,
    description: str,
    cash_back_bp: int = 0,
    statement_id: int | None = None,
    on_date: datetime | None = None,
) -> CreditEntry:
    """The only way `balance` changes. Entry and balance move together."""
    entry = CreditEntry(
        child_id=profile.user_id,
        amount=amount,
        kind=kind,
        description=description[:120],
        cash_back_bp=cash_back_bp,
        statement_id=statement_id,
        on_date=on_date if on_date is not None else aware(profile.sim_now or _now()),
    )
    profile.balance += amount
    session.add(entry)
    session.add(profile)
    return entry


# ---- Spending ---------------------------------------------------------------------

def purchase_block_reason(session: Session, profile: CreditProfile, price: int, *, at_tap: bool) -> str | None:
    """Why this purchase cannot go through right now, or None if it can."""
    if is_credit(profile):
        left = available_credit(profile)
        if price > left:
            lead = "Declined: that" if at_tap else "That"
            return f"{lead} would take you over your credit limit. You have {_wc(left)} of credit left."
        return None
    if balance_of(session, profile.user_id) < price:
        return "You don't have enough money for this any more" if at_tap else "You don't have enough money for this yet"
    return None


def charge_purchase(session: Session, profile: CreditProfile, card: Card, price: int, title: str) -> CreditEntry:
    """Put a purchase on the child's card. Call `purchase_block_reason` first."""
    return post_entry(
        session, profile, amount=price, kind="purchase", description=title, cash_back_bp=card.rewards_bp
    )


# ---- Paying a statement -------------------------------------------------------------

@dataclass
class PaymentResult:
    statement: Statement
    paid: int
    cash_back: int  # credited to the child's balance by this payment (0 if none)


def pay_statement(session: Session, profile: CreditProfile, amount: int) -> PaymentResult:
    """Pay `amount` of the open statement from the child's own balance."""
    statement = open_statement(session, profile.user_id)
    if statement is None:
        raise CreditError("You have no statement to pay right now.")
    remaining = remaining_on(statement)
    if amount < 1:
        raise CreditError("Enter an amount to pay.")
    if amount > remaining:
        raise CreditError(f"You only owe {_wc(remaining)} on this statement.")
    wallet = balance_of(session, profile.user_id)
    if amount > wallet:
        raise CreditError(f"You only have {_wc(wallet)} in your balance. Earn some more first.")

    add_entry(
        session, child_id=profile.user_id, amount=-amount, kind="card_payment",
        description=f"Card payment, statement {statement.number}",
    )
    post_entry(
        session, profile, amount=-amount, kind="payment",
        description=f"Payment, statement {statement.number}", statement_id=statement.id,
    )
    statement.paid += amount

    cash_back = 0
    if statement.paid >= statement.total:
        statement.status = "paid"
        on_time = aware(profile.sim_now or _now()) <= aware(statement.due_date)
        if on_time and statement.cash_back > 0 and not statement.cash_back_paid:
            add_entry(
                session, child_id=profile.user_id, amount=statement.cash_back, kind="cash_back",
                description=f"Cash back, statement {statement.number}",
            )
            statement.cash_back_paid = True
            cash_back = statement.cash_back
    session.add(statement)
    return PaymentResult(statement=statement, paid=amount, cash_back=cash_back)


# ---- Skipping a month -----------------------------------------------------------------

@dataclass
class MonthResult:
    sim_date: datetime
    allowance: int  # total weekly allowance paid into the child's balance
    previous: Statement | None  # the statement whose due date just passed (None if it was already settled)
    outcome: str | None  # paid | carried | late
    interest: int  # interest charged on the new statement
    late_fee: int  # late fee charged for the previous statement
    statement: Statement | None  # the new one (None on Debit)
    score_before: int = 0
    score_after: int = 0
    score_changes: list[ScoreChange] = field(default_factory=list)  # why the score moved this month


def advance_month(session: Session, child: User, profile: CreditProfile) -> MonthResult:
    """Move the child's clock on one month: allowance, the due date, interest, fees, a new statement."""
    assert child.id is not None
    if profile.score_payment < 0:  # get_profile does this; be safe for an account that skipped it
        init_score(profile, utilisation_bp_of(profile.balance, profile.credit_limit))
    score_before = profile.score
    prev = latest_statement(session, child.id)

    # 1. Four weeks of allowance.
    allowance = 0
    weekly = child.weekly_allowance or 0
    if weekly > 0:
        for _ in range(ALLOWANCE_WEEKS):
            add_entry(session, child_id=child.id, amount=weekly, kind="allowance", description="Weekly allowance")
        allowance = weekly * ALLOWANCE_WEEKS

    # 2. The previous statement's due date has passed. How did the child do?
    outcome: str | None = None
    late_fee = 0
    carried = 0
    evaluated: Statement | None = None
    if prev is not None and not prev.settled:
        evaluated = prev
        carried = remaining_on(prev)
        if prev.status == "paid" or carried == 0:
            prev.status, outcome = "paid", "paid"
        elif prev.paid >= prev.minimum:
            prev.status, outcome = "carried", "carried"
        else:
            prev.status, outcome = "late", "late"
            if prev.late_fee > 0:
                late_fee = prev.late_fee
                post_entry(
                    session, profile, amount=late_fee, kind="late_fee",
                    description=f"Late fee, statement {prev.number}", on_date=aware(prev.due_date),
                )
        prev.settled = True
        session.add(prev)
        if prev.total > 0:  # a month with nothing to pay neither builds nor breaks the streak
            profile.on_time_streak = 0 if outcome == "late" else profile.on_time_streak + 1

    # 3. The clock moves on to the new statement day.
    statement_date = aware(profile.sim_now or _now()) + timedelta(days=CYCLE_DAYS)
    profile.sim_now = statement_date
    profile.cycles_done += 1
    profile.months_open += 1

    # 4. Interest on whatever was not paid (nothing if the last statement was paid in full: the grace period).
    interest = interest_for(carried, profile.current_apr_bp)
    if interest > 0:
        post_entry(
            session, profile, amount=interest, kind="interest",
            description=f"Interest on {_wc(carried)} carried over", on_date=statement_date,
        )

    # 5. A new statement, if the child has a card with credit.
    statement: Statement | None = None
    if is_credit(profile) or profile.balance > 0:
        new_charges = session.exec(
            select(CreditEntry).where(CreditEntry.child_id == child.id, col(CreditEntry.statement_id).is_(None))
        ).all()
        purchases = [e for e in new_charges if e.kind == "purchase"]
        purchases_total = sum(e.amount for e in purchases)
        interest_total = sum(e.amount for e in new_charges if e.kind == "interest")
        fees_total = sum(e.amount for e in new_charges if e.kind == "late_fee")
        total = profile.balance
        statement = Statement(
            child_id=child.id,
            number=profile.cycles_done,
            card_id=profile.current_card_id,
            apr_bp=profile.current_apr_bp,
            late_fee=_late_fee_of(session, profile.current_card_id),
            statement_date=statement_date,
            due_date=statement_date + timedelta(days=GRACE_DAYS),
            # What is left once this month's charges are taken off: the unpaid part of the last statement.
            # Computed (not copied from `carried`) so the breakdown on the statement always adds up exactly.
            carried=total - purchases_total - interest_total - fees_total,
            purchases=purchases_total,
            interest=interest_total,
            fees=fees_total,
            total=total,
            minimum=minimum_payment(total),
            cash_back=cash_back_for(purchases),
            status="paid" if total <= 0 else "open",
        )
        session.add(statement)
        session.flush()  # we need its id
        for entry in new_charges:
            entry.statement_id = statement.id
            session.add(entry)
        if purchases_total > 0:
            profile.monthly_spend = purchases_total

    # 6. The credit score is recalculated each time a month closes, and the reasons are saved.
    score_changes = update_for_month(
        session,
        profile,
        outcome=outcome if evaluated is not None and evaluated.total > 0 else None,
        previous_number=evaluated.number if evaluated is not None else None,
        has_credit=is_credit(profile),
        statement_total=statement.total if statement is not None else 0,
        on_date=statement_date,
    )
    session.add(profile)

    return MonthResult(
        sim_date=statement_date, allowance=allowance, previous=evaluated, outcome=outcome,
        interest=interest, late_fee=late_fee, statement=statement,
        score_before=score_before, score_after=profile.score, score_changes=score_changes,
    )


# ---- helpers -----------------------------------------------------------------------

def _wc(minor: int) -> str:
    return f"{minor / 100:,.2f} WC"


def _late_fee_of(session: Session, card_id: str) -> int:
    card = session.get(Card, card_id)
    return card.late_fee if card else 0
