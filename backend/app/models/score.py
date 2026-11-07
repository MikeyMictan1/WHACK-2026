"""The credit score (docs/DESIGN.md section 6): 300 to 800, from three simplified factors.

  Payment history   up to 250 points (50%)  paying on time, the biggest weight
  Utilisation       up to 150 points (30%)  how much of the limit you use on statement day; under 10% is best
  Length of history up to 100 points (20%)  how long the account has been open (full marks at 12 months)

  score = 300 + payment + utilisation + history

It is recalculated once a month, when a statement is issued (`update_for_month`, called by
`credit.advance_month`). Each change is saved as a `ScoreEvent` with its reason ("Statement 2 paid in full
on time"), so the app can always show why the score moved. Everything here is plain integer maths; Claude
only explains these numbers, it never decides them.

The score is always tracked. Whether a child is *shown* it is the parent's setting (age preset or the
Custom "credit score" option); see `score_enabled`.

Nothing here commits: the caller does.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Session, SQLModel

if TYPE_CHECKING:  # card.py imports this module, so only import it for type hints
    from app.models.card import CreditProfile

SCORE_MIN = 300
SCORE_MAX = 800
PAYMENT_MAX = 250
UTILISATION_MAX = 150
HISTORY_MAX = 100
HISTORY_FULL_MONTHS = 12

START_PAYMENT = 130  # a new account has no record yet, so it starts with a middling one (a 580 score to begin)
PAYMENT_GAIN_PERCENT = 12  # an on-time statement closes this share of the gap to full marks
LATE_MIN_HIT = 40  # a late payment costs at least this many points...
LATE_HIT_PERCENT = 30  # ...or this share of the payment-history points, whichever is more

# Utilisation points as a function of utilisation (basis points: 1000 = 10%). Straight lines between the knots.
UTILISATION_KNOTS = [(0, 150), (1_000, 150), (3_000, 105), (5_000, 60), (10_000, 0)]

BANDS = [(580, "Needs work"), (670, "Fair"), (740, "Good"), (801, "Excellent")]  # same labels as the Learn page

FACTOR_NAMES = {
    "payment": "Payment history",
    "utilisation": "Credit used",
    "history": "Length of history",
    "steady": "No change",
}


# ---- Table ----------------------------------------------------------------

class ScoreEvent(SQLModel, table=True):
    """One reason the score moved in a month. A month with no change has a single "steady" row."""

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    month: int  # `CreditProfile.cycles_done` once that month's statement was issued: 1, 2, 3 ...
    factor: str  # payment | utilisation | history | steady
    delta: int  # points gained (+) or lost (-)
    reason: str = Field(max_length=200)
    score_after: int  # the score after the whole month, the same on every row of that month
    on_date: datetime  # the child's simulated date
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---- Pure rules ----------------------------------------------------------------

def history_points(months_open: int) -> int:
    """Length of history: 100 points over the first 12 months, rounded to the nearest point."""
    months = max(0, min(months_open, HISTORY_FULL_MONTHS))
    return (HISTORY_MAX * months + HISTORY_FULL_MONTHS // 2) // HISTORY_FULL_MONTHS


def utilisation_points(utilisation_bp: int) -> int:
    """Credit-used points: full marks at 10% or less, then falling in straight lines to 0 at 100%."""
    u = max(0, utilisation_bp)
    if u >= UTILISATION_KNOTS[-1][0]:
        return UTILISATION_KNOTS[-1][1]
    for (x0, y0), (x1, y1) in zip(UTILISATION_KNOTS, UTILISATION_KNOTS[1:]):
        if u <= x1:
            den = x1 - x0
            num = y0 * den + (y1 - y0) * (u - x0)
            return (2 * num + den) // (2 * den)  # round half up (num is never negative here)
    return 0


def utilisation_bp_of(owed: int, limit: int) -> int:
    """What share of the limit is used, in basis points (floor). No limit means nothing to measure."""
    return owed * 10_000 // limit if limit > 0 else 0


def payment_after_on_time(points: int) -> int:
    """A statement paid on time (in full, or at least the minimum) closes 12% of the gap to 250."""
    if points >= PAYMENT_MAX:
        return PAYMENT_MAX
    gain = max(1, ((PAYMENT_MAX - points) * PAYMENT_GAIN_PERCENT + 50) // 100)
    return min(PAYMENT_MAX, points + gain)


def payment_after_late(points: int) -> int:
    """A late payment costs a lot: at least 40 points, or 30% of what the child had built up."""
    hit = max(LATE_MIN_HIT, (points * LATE_HIT_PERCENT + 50) // 100)
    return max(0, points - hit)


def total_score(payment: int, utilisation: int, history: int) -> int:
    return SCORE_MIN + payment + utilisation + history


def band_of(score: int) -> str:
    return next(label for limit, label in BANDS if score < limit)


# ---- Whether a child sees it ------------------------------------------------------

PRESET_SCORE = {"10+": False, "13+": False, "15+": True}  # mirrors PRESET_SETTINGS in the add-child form


def score_enabled(app_experience: str | None) -> bool:
    """Is credit score tracking switched on for this child? From the age preset, or ticked under Custom."""
    if not app_experience:
        return False
    if app_experience in PRESET_SCORE:
        return PRESET_SCORE[app_experience]
    return "credit_score" in app_experience.split(",")


# ---- A child's account ---------------------------------------------------------------

def init_score(profile: "CreditProfile", utilisation_bp: int = 0) -> None:
    """Set up the score for an account that has none yet (a new child, or one made before scores existed)."""
    profile.score_payment = START_PAYMENT
    profile.score_utilisation = utilisation_points(utilisation_bp)
    profile.score_history = history_points(profile.months_open)
    profile.score = total_score(profile.score_payment, profile.score_utilisation, profile.score_history)


@dataclass
class ScoreChange:
    factor: str
    delta: int
    reason: str


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def update_for_month(
    session: Session,
    profile: "CreditProfile",
    *,
    outcome: str | None,  # how the previous statement ended: paid | carried | late (None: nothing was due)
    previous_number: int | None,
    has_credit: bool,  # on a credit card (not Debit)
    statement_total: int,  # what was owed on statement day
    on_date: datetime,
) -> list[ScoreChange]:
    """Recalculate the score for the month that just closed, save why it moved, and return the changes.

    `profile.cycles_done` must already count this month, and `profile.months_open` be up to date.
    """
    changes: list[ScoreChange] = []

    # 1. Payment history: how the previous statement ended.
    if outcome in ("paid", "carried", "late") and previous_number is not None:
        before = profile.score_payment
        if outcome == "late":
            after = payment_after_late(before)
            reason = f"Statement {previous_number} was paid late"
        else:
            after = payment_after_on_time(before)
            reason = (
                f"Statement {previous_number} paid in full on time"
                if outcome == "paid"
                else f"Statement {previous_number}: paid at least the minimum on time"
            )
        profile.score_payment = after
        if after != before:
            changes.append(ScoreChange("payment", after - before, reason))

    # 2 and 3. Credit used and length of history only count while the child has a credit card.
    if has_credit:
        util_bp = utilisation_bp_of(statement_total, profile.credit_limit)
        used = round(util_bp / 100)
        before = profile.score_utilisation
        after = utilisation_points(util_bp)
        profile.score_utilisation = after
        if after != before:
            if util_bp == 0:
                reason = "You owed nothing on statement day (under 10% of your limit is best)"
            elif util_bp <= 1_000:
                reason = f"You used only {used}% of your limit (under 10% is best)"
            else:
                reason = f"You used {used}% of your limit (under 10% is best)"
            changes.append(ScoreChange("utilisation", after - before, reason))

        before = profile.score_history
        after = history_points(profile.months_open)
        profile.score_history = after
        if after != before:
            changes.append(ScoreChange("history", after - before, f"Your account is {_plural(profile.months_open, 'month')} old"))

    profile.score = total_score(profile.score_payment, profile.score_utilisation, profile.score_history)

    # Nothing to show for a month where nothing was measured (Debit with nothing due).
    if not changes and not has_credit and outcome is None:
        return changes

    month = profile.cycles_done
    rows = changes or [ScoreChange("steady", 0, "Your score stayed the same this month")]
    for c in rows:
        session.add(
            ScoreEvent(
                child_id=profile.user_id, month=month, factor=c.factor, delta=c.delta, reason=c.reason,
                score_after=profile.score, on_date=on_date,
            )
        )
    session.add(profile)
    return changes
