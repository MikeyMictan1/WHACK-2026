"""The child's milestones page: the goals their parent set, how close they are, and redeeming one.

  GET  /api/milestones               the child's milestones with progress against their own balance
  POST /api/milestones/{id}/redeem   spend the cost from their balance (never the credit card) and mark it reached
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.controllers.deps import CurrentChild
from app.core.database import SessionDep
from app.models.milestone import Milestone, RedeemError, list_milestones, redeem
from app.models.pricing import money
from app.models.push import notify
from app.models.shop import balance_of

router = APIRouter(prefix="/milestones", tags=["milestones"])


class MilestoneOut(BaseModel):
    id: int
    name: str
    cost: int
    progress_pct: int  # 0 to 100: their balance against the cost
    redeemed_at: datetime | None


class MilestonesOut(BaseModel):
    balance: int  # the child's own money; milestones are only ever paid from this
    milestones: list[MilestoneOut]


def _out(m: Milestone, balance: int) -> MilestoneOut:
    assert m.id is not None
    pct = 100 if m.redeemed_at or m.cost <= 0 else max(0, min(100, balance * 100 // m.cost))
    return MilestoneOut(id=m.id, name=m.name, cost=m.cost, progress_pct=pct, redeemed_at=m.redeemed_at)


@router.get("", response_model=MilestonesOut)
def get_milestones(child: CurrentChild, session: SessionDep) -> MilestonesOut:
    assert child.id is not None
    balance = balance_of(session, child.id)
    return MilestonesOut(balance=balance, milestones=[_out(m, balance) for m in list_milestones(session, child.id)])


@router.post("/{milestone_id}/redeem", response_model=MilestonesOut)
def redeem_milestone(milestone_id: int, child: CurrentChild, session: SessionDep) -> MilestonesOut:
    assert child.id is not None
    milestone = session.get(Milestone, milestone_id)
    if milestone is None or milestone.child_id != child.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Milestone not found")
    try:
        redeem(session, milestone)
    except RedeemError as e:
        session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    session.commit()
    if child.parent_id is not None:
        name = child.username
        notify(child.parent_id, f"{name} reached a milestone", f"{milestone.name}, {money(milestone.cost)} from their savings.")
    return get_milestones(child, session)
