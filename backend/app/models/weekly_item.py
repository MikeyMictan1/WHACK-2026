"""Items a parent lets a child order each week: a name, a cost in WC and a per-week limit."""

from sqlmodel import Field, Session, SQLModel, delete, select

from app.models.shop import Reward

# ---- Table -----------------------------------------------------------------


class WeeklyItem(SQLModel, table=True):
    __tablename__ = "weekly_item"  # type: ignore[assignment]

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=60)
    cost: int  # minor units (1/100 WC)
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


def sync_weekly_rewards(session: Session, child_id: int, parent_id: int) -> None:
    """Put the child's weekly items in their shop: one Reward each (kind "weekly", `child_id` set).

    Matched by name, so editing a price or limit keeps this week's purchase count. Items taken off the
    list are hidden (kept for purchase history). Called whenever the child's shop is read. Commits.
    """
    items = {i.name.strip().lower(): i for i in list_weekly_items(session, child_id)}
    rewards = session.exec(select(Reward).where(Reward.child_id == child_id).order_by(Reward.id)).all()  # type: ignore[arg-type]
    seen: set[str] = set()
    changed = False
    for r in rewards:
        key = r.title.strip().lower()
        item = items.get(key)
        if item is None or key in seen:
            if r.active:
                r.active = False
                session.add(r)
                changed = True
            continue
        seen.add(key)
        if (r.title, r.price, r.weekly_limit, r.active, r.parent_id) != (item.name, item.cost, item.weekly_limit, True, parent_id):
            r.title, r.price, r.weekly_limit, r.active, r.parent_id = item.name, item.cost, item.weekly_limit, True, parent_id
            session.add(r)
            changed = True
    for key, item in items.items():
        if key not in seen:
            session.add(
                Reward(
                    parent_id=parent_id,
                    child_id=child_id,
                    title=item.name,
                    description="From your weekly list",
                    price=item.cost,
                    kind="weekly",
                    weekly_limit=item.weekly_limit,
                )
            )
            changed = True
    if changed:
        session.commit()
