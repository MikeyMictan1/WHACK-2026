"""Milestones a parent sets for a child: a name and a cost in WC.

The child redeems one on their Milestones page once their own balance covers it (`redeem`): the cost comes out of
their balance (never their credit card) and the milestone is marked reached.
"""

from datetime import datetime

from sqlalchemy import update
from sqlmodel import Field, Session, SQLModel, col, delete, select

from app.models.shop import add_entry, balance_of, utcnow

# ---- Table -----------------------------------------------------------------


class Milestone(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=60)
    cost: int  # minor units (1/100 WC)
    redeemed_at: datetime | None = None  # set once the child has redeemed it (site clock)


# ---- Schemas ---------------------------------------------------------------


class MilestoneInput(SQLModel):
    name: str = Field(min_length=1, max_length=60)
    cost: int = Field(ge=0)


class MilestonePublic(SQLModel):
    id: int
    name: str
    cost: int
    redeemed_at: datetime | None = None


# ---- Data access -----------------------------------------------------------


def list_milestones(session: Session, child_id: int) -> list[Milestone]:
    query = select(Milestone).where(Milestone.child_id == child_id).order_by(Milestone.id)  # type: ignore[arg-type]
    return list(session.exec(query))


def replace_milestones(session: Session, child_id: int, items: list[MilestoneInput]) -> None:
    """Make the child's list match `items`. Matched by name, so editing a cost keeps a milestone already
    redeemed. Caller commits."""
    existing = {m.name.strip().lower(): m for m in list_milestones(session, child_id)}
    keep: set[int] = set()
    for item in items:
        name = item.name.strip()
        row = existing.get(name.lower())
        if row is None or row.id in keep:
            session.add(Milestone(child_id=child_id, name=name, cost=item.cost))
            continue
        assert row.id is not None
        keep.add(row.id)
        row.name, row.cost = name, item.cost
        session.add(row)
    for row in existing.values():
        if row.id not in keep:
            session.delete(row)


class RedeemError(Exception):
    """Why a milestone can't be redeemed (already reached, or not enough money)."""


def redeem(session: Session, milestone: Milestone) -> None:
    """Spend the milestone's cost from the child's own balance and mark it reached. Raises RedeemError.

    Claims it first with one UPDATE, so a double click can only redeem it once. Caller commits; on RedeemError
    the caller rolls back.
    """
    assert milestone.id is not None
    claimed = session.exec(  # type: ignore[call-overload]
        update(Milestone)
        .where(col(Milestone.id) == milestone.id, col(Milestone.redeemed_at).is_(None))
        .values(redeemed_at=utcnow())
    ).rowcount == 1
    if not claimed:
        raise RedeemError("You have already reached this milestone")
    balance = balance_of(session, milestone.child_id)
    if balance < milestone.cost:
        raise RedeemError("You don't have enough money for this yet")
    add_entry(session, child_id=milestone.child_id, amount=-milestone.cost, kind="milestone", description=milestone.name)


def delete_milestones(session: Session, child_id: int) -> None:
    session.exec(delete(Milestone).where(Milestone.child_id == child_id))  # type: ignore[call-overload]
