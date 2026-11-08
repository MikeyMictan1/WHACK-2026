"""Change plan: the five cards, what each would cost this child, and the child's current plan."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.controllers.deps import CurrentChild
from app.core.database import SessionDep
from app.models.card import Card, CreditProfile, allowed_ids, card_limit_for, get_profile, limit_for, list_cards
from app.models.score import score_enabled
from app.models.pricing import (
    blocked_reason,
    estimate_balance,
    estimate_is_example,
    monthly_interest,
    switch_locked_reason,
    twelve_month_cost,
    typical_range_bp,
)

router = APIRouter(prefix="/plans", tags=["plans"])


class CurrentPlan(BaseModel):
    card_id: str
    card_name: str
    apr_bp: int
    credit_limit: int
    balance: int
    score: int | None  # None when the parent has switched credit score tracking off
    on_time_streak: int
    utilisation_pct: int
    interest_this_month: int


class PlanOption(BaseModel):
    id: str
    name: str
    pitch: str
    negotiable: bool
    listed_apr_bp: int
    typical_low_bp: int  # lowest APR to show: the floor rounded down to a whole percent
    typical_high_bp: int
    credit_limit: int
    rewards_bp: int
    late_fee: int
    min_score: int
    monthly_interest: int  # at the listed APR on the child's current balance
    year_net_cost: int  # interest minus cash back over 12 months at the listed APR
    is_current: bool
    blocked_reason: str | None


class PlansResponse(BaseModel):
    current: CurrentPlan
    options: list[PlanOption]
    # The interest figures use what the child really owes, or an example size if they owe nothing.
    estimate_balance: int
    estimate_is_example: bool
    switch_locked_reason: str | None  # set after a plan change, until the next statement


def current_plan(profile: CreditProfile, session: SessionDep, *, show_score: bool = True) -> CurrentPlan:
    card = next(c for c in list_cards(session) if c.id == profile.current_card_id)
    return CurrentPlan(
        card_id=card.id,
        card_name=card.name,
        apr_bp=profile.current_apr_bp,
        credit_limit=profile.credit_limit,
        balance=profile.balance,
        score=profile.score if show_score else None,
        on_time_streak=profile.on_time_streak,
        utilisation_pct=round(100 * profile.balance / profile.credit_limit) if profile.credit_limit else 0,
        interest_this_month=monthly_interest(profile.balance, profile.current_apr_bp),
    )


def _option(
    profile: CreditProfile, card: Card, allowed: set[str] | None, show_score: bool = True, limit: int | None = None
) -> PlanOption:
    low, high = typical_range_bp(profile, card) if card.negotiable else (card.listed_apr_bp, card.listed_apr_bp)
    return PlanOption(
        id=card.id,
        name=card.name,
        pitch=card.pitch,
        negotiable=card.negotiable,
        listed_apr_bp=card.listed_apr_bp,
        typical_low_bp=low,
        typical_high_bp=high,
        credit_limit=limit_for(card, profile.weekly_allowance) if limit is None else limit,
        rewards_bp=card.rewards_bp,
        late_fee=card.late_fee,
        min_score=card.min_score,
        monthly_interest=monthly_interest(estimate_balance(profile), card.listed_apr_bp),
        year_net_cost=twelve_month_cost(profile, card, card.listed_apr_bp).net,
        is_current=card.id == profile.current_card_id,
        blocked_reason=blocked_reason(profile, card, allowed, show_score=show_score, limit=limit),
    )


@router.get("")
def get_plans(child: CurrentChild, session: SessionDep) -> PlansResponse:
    assert child.id is not None
    profile = get_profile(session, child.id)
    allowed = allowed_ids(profile)
    show_score = score_enabled(child.app_experience)
    return PlansResponse(
        current=current_plan(profile, session, show_score=show_score),
        options=[_option(profile, c, allowed, show_score, card_limit_for(session, c, child.id)) for c in list_cards(session)],
        estimate_balance=estimate_balance(profile),
        estimate_is_example=estimate_is_example(profile),
        switch_locked_reason=switch_locked_reason(profile),
    )
