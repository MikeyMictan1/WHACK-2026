"""A parent's breakdown of one child: spending, score history, credit costs and a written recap.

  GET  /api/breakdown/{child_id}        everything on one page (parent only, own children only)
  POST /api/breakdown/{child_id}/recap  write a fresh recap (Claude, or the built-in summary if it is unavailable)
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.controllers.credit_controller import CreditSummary, ScoreInfo, build_score_info, build_summary
from app.controllers.deps import CurrentParent
from app.core.database import SessionDep
from app.core.recap_bot import generate_recap
from app.models.breakdown import credit_costs, earned_breakdown, recent_transactions, spending_breakdown
from app.models.card import get_profile
from app.models.clock import site_now
from app.models.credit import aware
from app.models.recap import Recap, latest_recap
from app.models.score import score_enabled
from app.models.user import User, get_child

router = APIRouter(prefix="/breakdown", tags=["breakdown"])

RECAP_COOLDOWN_SECONDS = 20  # the AI call is slow and costs money; no need to hammer it


class RowOut(BaseModel):
    key: str
    label: str
    count: int
    total: int


class TransactionOut(BaseModel):
    id: int
    amount: int
    kind: str
    description: str
    created_at: datetime


class RecapOut(BaseModel):
    id: int
    created_at: datetime
    headline: str
    spending: str
    credit: str
    praise: str
    talk_about: list[str]
    scripted: bool  # True when the built-in summary wrote it instead of the AI


class BreakdownOut(BaseModel):
    child_id: int
    child_name: str
    username: str
    score_tracking: bool  # the parent's setting for this child; the history below is shown to the parent either way
    summary: CreditSummary
    score: ScoreInfo
    spending: list[RowOut]
    spent_total: int
    earned: list[RowOut]
    earned_total: int
    interest_total: int
    late_fee_total: int
    transactions: list[TransactionOut]
    recap: RecapOut | None


def _own_child(session: SessionDep, parent: User, child_id: int) -> User:
    child = get_child(session, parent.id, child_id)  # type: ignore[arg-type]
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child not found.")
    return child


def _recap_out(recap: Recap | None) -> RecapOut | None:
    if recap is None or recap.id is None:
        return None
    return RecapOut(
        id=recap.id, created_at=recap.created_at, headline=recap.headline, spending=recap.spending, credit=recap.credit,
        praise=recap.praise, talk_about=recap.talk_points(), scripted=recap.scripted,
    )


@router.get("/{child_id}")
def child_breakdown(child_id: int, parent: CurrentParent, session: SessionDep) -> BreakdownOut:
    child = _own_child(session, parent, child_id)
    assert child.id is not None
    profile = get_profile(session, child.id)  # first: it may commit, which would expire anything loaded before it
    summary = build_summary(session, child)
    if summary.score is None:  # the child's own screens hide the score when tracking is off; the parent still sees it
        summary = summary.model_copy(update={"score": build_score_info(session, profile)})
    spending = spending_breakdown(session, child.id)
    earned = earned_breakdown(session, child.id)
    interest, late_fees = credit_costs(session, child.id)
    assert summary.score is not None
    return BreakdownOut(
        child_id=child.id,
        child_name=child.username,
        username=child.username,
        score_tracking=score_enabled(child.app_experience),
        summary=summary,
        score=summary.score,
        spending=[RowOut(key=r.key, label=r.label, count=r.count, total=r.total) for r in spending],
        spent_total=sum(r.total for r in spending),
        earned=[RowOut(key=r.key, label=r.label, count=r.count, total=r.total) for r in earned],
        earned_total=sum(r.total for r in earned),
        interest_total=interest,
        late_fee_total=late_fees,
        transactions=[
            TransactionOut(id=t.id, amount=t.amount, kind=t.kind, description=t.description, created_at=t.created_at)
            for t in recent_transactions(session, child.id)
        ],
        recap=_recap_out(latest_recap(session, child.id)),
    )


@router.post("/{child_id}/recap")
def write_recap(child_id: int, parent: CurrentParent, session: SessionDep) -> RecapOut:
    child = _own_child(session, parent, child_id)
    assert child.id is not None
    last = latest_recap(session, child.id)
    if last is not None:
        # Recaps are stamped with the site clock, which an admin can move; compare with the same clock.
        age = aware(site_now()) - aware(last.created_at)
        if timedelta(0) <= age < timedelta(seconds=RECAP_COOLDOWN_SECONDS):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "A recap was just written. Give it a moment.")
    recap = generate_recap(session, child)
    out = _recap_out(recap)
    assert out is not None
    return out

