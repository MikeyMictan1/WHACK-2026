"""Items a parent lets a child order each week: a name, a cost in WC and a per-week limit."""

from sqlmodel import Field, Session, SQLModel, delete, select

# ---- Table -----------------------------------------------------------------


class WeeklyItem(SQLModel, table=True):
    __tablename__ = "weekly_item"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=60)
    cost: int  # in WC
    weekly_limit: int  # how many times per week the child can order it


# ---- Schemas ---------------------------------------------------------------


class WeeklyItemInput(SQLModel):
    name: str = Field(min_length=1, max_length=60)
    cost: int = Field(ge=0)
    weekly_limit: int = Field(ge=1)


class WeeklyItemPublic(SQLModel):
    id: int
    name: str
    cost: int
    weekly_limit: int


# ---- Data access -----------------------------------------------------------


def list_weekly_items(session: Session, child_id: int) -> list[WeeklyItem]:
    query = select(WeeklyItem).where(WeeklyItem.child_id == child_id).order_by(WeeklyItem.id)  # type: ignore[arg-type]
    return list(session.exec(query))


def replace_weekly_items(session: Session, child_id: int, items: list[WeeklyItemInput]) -> None:
    """Swap the child's whole list for `items`. Caller commits."""
    delete_weekly_items(session, child_id)
    for item in items:
        session.add(WeeklyItem(child_id=child_id, name=item.name.strip(), cost=item.cost, weekly_limit=item.weekly_limit))


def delete_weekly_items(session: Session, child_id: int) -> None:
    session.exec(delete(WeeklyItem).where(WeeklyItem.child_id == child_id))  # type: ignore[call-overload]
