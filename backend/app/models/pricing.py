"""Pricing rules. Plain functions: the same inputs always give the same answer.

The backend owns every number. The seller bot only talks about them, and any offer it makes is
clamped by `clamp_offer` before it is recorded.
"""

from dataclasses import dataclass

from app.models.card import Card, CreditProfile, limit_for
from app.models.credit import EXAMPLE_BALANCE, interest_for

MAX_SCORE = 800
SCORE_FLOOR = 300  # the lowest score there is, so "no score needed" cards still measure from here
CONCESSION_STEPS = 2  # the bot can only reach the floor after at least this many accepted offers
PENALTY_STEP_BP = 100  # default: the most one rude message can add to the rate (1 percentage point)
MAX_PENALTY_BP = 300  # default: the rate can never go more than this far above the listed APR
RECOVERY_STEP_BP = 100  # being polite takes a penalty back off this much at a time, on every card


def pct(bp: int) -> str:
    """2499 -> '24.99%', 2400 -> '24%'."""
    text = f"{bp / 100:.2f}".rstrip("0").rstrip(".")
    return f"{text}%"


def money(minor: int) -> str:
    """Display only. All money is play money in Whack Coins (WC), never a real currency."""
    return f"{minor / 100:,.2f} WC"


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def quality(profile: CreditProfile, card: Card) -> float:
    """0..1: how strong the child looks to this card (score, payment streak, utilisation)."""
    base = max(card.min_score, SCORE_FLOOR)
    score_part = _clamp01((profile.score - base) / max(1, MAX_SCORE - base))
    streak_part = _clamp01(profile.on_time_streak / 6)
    utilisation = profile.balance / profile.credit_limit if profile.credit_limit else 1.0
    util_part = 1 - _clamp01((utilisation - 0.10) / 0.40)  # 10% or less is best, 50%+ is worst
    return 0.5 * score_part + 0.3 * streak_part + 0.2 * util_part


def floor_apr_bp(profile: CreditProfile, card: Card) -> int:
    """The lowest APR this child can ever get on this card. Never sent to the browser."""
    discount = round(card.max_discount_bp * quality(profile, card))
    return card.listed_apr_bp - discount


def typical_range_bp(profile: CreditProfile, card: Card) -> tuple[int, int]:
    """What the child may see: the floor rounded down to a whole percent, up to the listed APR."""
    floor = floor_apr_bp(profile, card)
    return floor - floor % 100, card.listed_apr_bp


def ceiling_apr_bp(listed_bp: int, max_penalty_bp: int = MAX_PENALTY_BP) -> int:
    """The highest APR a negotiation can ever reach: the listed rate plus the card's biggest penalty."""
    return listed_bp + max_penalty_bp


def clamp_offer(
    requested_bp: int,
    *,
    listed_bp: int,
    floor_bp: int,
    best_bp: int,
    ceiling_bp: int,
    penalty_step_bp: int = PENALTY_STEP_BP,
) -> int:
    """Turn what the bot asked for into the offer the backend will actually record.

    - lowering: never below the floor, and by at most half of the discount on offer per step,
      so reaching the floor takes 2+ steps
    - raising (for rude behaviour): by at most the card's penalty step, never above the ceiling
    - being polite takes a penalty off one recovery step at a time, so a big penalty takes a while to earn back
    """
    if requested_bp >= best_bp:
        return min(requested_bp, best_bp + penalty_step_bp, max(ceiling_bp, best_bp))
    available = max(0, listed_bp - floor_bp)
    max_drop = max(25, -(-available // CONCESSION_STEPS)) if available else 0
    if best_bp > listed_bp:
        max_drop = max(max_drop, RECOVERY_STEP_BP)  # a penalty can always be earned back by being polite
    return max(requested_bp, floor_bp, best_bp - max_drop)


# ---- Estimates shown to the child ------------------------------------------------

def monthly_interest(balance: int, apr_bp: int) -> int:
    """The same rule the statements use (models/credit.interest_for)."""
    return interest_for(balance, apr_bp)


def estimate_balance(profile: CreditProfile) -> int:
    """The balance the estimates use: what the child really owes, or an example size if they owe nothing
    (at real-life size the interest is easy to see, as DESIGN.md section 6.1 recommends)."""
    return profile.balance if profile.balance > 0 else EXAMPLE_BALANCE


def estimate_is_example(profile: CreditProfile) -> bool:
    return profile.balance <= 0


@dataclass
class YearCost:
    interest: int
    rewards: int
    fees: int
    net: int  # interest + fees - rewards


def twelve_month_cost(profile: CreditProfile, card: Card, apr_bp: int) -> YearCost:
    """A simple year ahead: the balance stays where it is, spending stays the same, no late fees."""
    interest = (estimate_balance(profile) * apr_bp + 5_000) // 10_000
    rewards = round(profile.monthly_spend * 12 * card.rewards_bp / 10_000)
    return YearCost(interest=interest, rewards=rewards, fees=0, net=interest - rewards)


def switch_locked_reason(profile: CreditProfile) -> str | None:
    """You can change plan once a month: after a change, the next one waits for the next statement."""
    if profile.last_switch_cycle == profile.cycles_done:
        return "You already changed plan this month. You can change again after your next statement."
    return None


def blocked_reason(
    profile: CreditProfile, card: Card, allowed: set[str] | None, *, show_score: bool = True
) -> str | None:
    """Why the child can't pick this card right now, or None if they can.

    `show_score` is False when the parent has switched credit score tracking off for this child: the reason
    then says the card needs a stronger credit record without naming a number they can't see.
    """
    if card.id == profile.current_card_id:
        return "This is your current plan."
    if allowed is not None and card.id not in allowed:
        return "Your parent has not turned this card on."
    if profile.score < card.min_score:
        if not show_score:
            return "This card needs a stronger credit record first."
        return f"You need a score of {card.min_score}. Yours is {profile.score}."
    if card.id == "debit" and profile.balance > 0:
        return "Pay off your balance first. Debit has no borrowing."
    limit = limit_for(card, profile.weekly_allowance)
    if limit and profile.balance > limit:
        return "Your balance is higher than this card's limit."
    return switch_locked_reason(profile)
