"""Milestones a parent sets for a child: a name and a cost in WC."""

from sqlmodel import Field, Session, SQLModel, delete, select

# ---- Table -----------------------------------------------------------------


class Milestone(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=60)
    cost: int  # minor units (1/100 WC)


# ---- Schemas ---------------------------------------------------------------


class MilestoneInput(SQLModel):
    name: str = Field(min_length=1, max_length=60)
    cost: int = Field(ge=0)


class MilestonePublic(SQLModel):
    id: int
    name: str
    cost: int


# ---- Data access -----------------------------------------------------------


def list_milestones(session: Session, child_id: int) -> list[Milestone]:
    query = select(Milestone).where(Milestone.child_id == child_id).order_by(Milestone.id)  # type: ignore[arg-type]
    return list(session.exec(query))


def replace_milestones(session: Session, child_id: int, items: list[MilestoneInput]) -> None:
    """Swap the child's whole list for `items`. Caller commits."""
    delete_milestones(session, child_id)
    for item in items:
        session.add(Milestone(child_id=child_id, name=item.name.strip(), cost=item.cost))


def delete_milestones(session: Session, child_id: int) -> None:
    session.exec(delete(Milestone).where(Milestone.child_id == child_id))  # type: ignore[call-overload]
