"""Decor: cosmetics a child owns (paid in-game rewards) placed in the left and right side panels.

Owning is the shop's job (a paid `PurchaseRequest` of kind "in_game"); this only stores where each owned item sits.
An item is placed at most once. The layout is saved whole, so the order of the list is the order on screen.
"""

from sqlmodel import Field, Session, SQLModel, col, select

from app.models.shop import PurchaseRequest

SIDES = ("left", "right")
SLOTS_PER_SIDE = 4


class DecorPlacement(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    reward_id: int = Field(foreign_key="reward.id")
    side: str  # left | right
    slot: int = 0  # 0 is the top


class DecorItem(SQLModel):
    reward_id: int
    title: str
    side: str | None  # None = owned but not placed
    slot: int | None


class DecorLayoutItem(SQLModel):
    reward_id: int
    side: str


def owned_decor(session: Session, child_id: int) -> dict[int, str]:
    """reward id -> title, for every in-game item the child has paid for (the oldest purchase's title wins)."""
    rows = session.exec(
        select(PurchaseRequest)
        .where(PurchaseRequest.child_id == child_id, PurchaseRequest.status == "paid", PurchaseRequest.kind == "in_game")
        .order_by(col(PurchaseRequest.id))
    ).all()
    out: dict[int, str] = {}
    for r in rows:
        out.setdefault(r.reward_id, r.title)
    return out


def decor_items(session: Session, child_id: int) -> list[DecorItem]:
    owned = owned_decor(session, child_id)
    placed = {
        p.reward_id: p
        for p in session.exec(select(DecorPlacement).where(DecorPlacement.child_id == child_id)).all()
    }
    items = [
        DecorItem(
            reward_id=rid,
            title=title,
            side=placed[rid].side if rid in placed else None,
            slot=placed[rid].slot if rid in placed else None,
        )
        for rid, title in owned.items()
    ]
    # placed items first, in screen order; then the ones still in the box
    items.sort(key=lambda i: (i.side is None, i.side or "", i.slot or 0, i.title))
    return items


def save_layout(session: Session, child_id: int, layout: list[DecorLayoutItem]) -> str | None:
    """Replace the child's layout. Returns an error message, or None when it was saved (the caller commits)."""
    owned = owned_decor(session, child_id)
    seen: set[int] = set()
    counts = {side: 0 for side in SIDES}
    for item in layout:
        if item.side not in SIDES:
            return "Pick the left or right side."
        if item.reward_id not in owned:
            return "You can only place items you own."
        if item.reward_id in seen:
            return "An item can only be placed once."
        seen.add(item.reward_id)
        counts[item.side] += 1
        if counts[item.side] > SLOTS_PER_SIDE:
            return f"The {item.side} side holds {SLOTS_PER_SIDE} items. Take one off first."
    for old in session.exec(select(DecorPlacement).where(DecorPlacement.child_id == child_id)).all():
        session.delete(old)
    slots = {side: 0 for side in SIDES}
    for item in layout:
        session.add(DecorPlacement(child_id=child_id, reward_id=item.reward_id, side=item.side, slot=slots[item.side]))
        slots[item.side] += 1
    return None
