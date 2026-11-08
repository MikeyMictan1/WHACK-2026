"""Admin-only views across every family."""

from fastapi import APIRouter
from sqlmodel import SQLModel, delete, select

from app.controllers.deps import CurrentAdmin
from app.core.database import SessionDep
from app.models.shop import CardLink
from app.models.user import User, UserPublic

router = APIRouter(prefix="/admin", tags=["admin"])


class FamilyOut(SQLModel):
    parent: UserPublic
    children: list[UserPublic]


@router.get("/parents", response_model=list[FamilyOut])
def all_parents(_: CurrentAdmin, session: SessionDep) -> list[FamilyOut]:
    """Every parent account, oldest first, each with their child accounts."""
    parents = session.exec(select(User).where(User.role == "parent").order_by(User.created_at)).all()  # type: ignore[arg-type]
    children = session.exec(select(User).where(User.role == "child").order_by(User.created_at)).all()  # type: ignore[arg-type]
    by_parent: dict[int, list[User]] = {}
    for c in children:
        if c.parent_id is not None:
            by_parent.setdefault(c.parent_id, []).append(c)
    return [
        FamilyOut(
            parent=UserPublic.model_validate(p, from_attributes=True),
            children=[UserPublic.model_validate(c, from_attributes=True) for c in by_parent.get(p.id or -1, [])],
        )
        for p in parents
    ]


class UnlinkResult(SQLModel):
    unlinked: int


@router.post("/cards/unlink-all", response_model=UnlinkResult)
def unlink_all_cards(_: CurrentAdmin, session: SessionDep) -> UnlinkResult:
    """Forget which NFC card belongs to which child, for every child.

    Links are keyed by the card's built-in serial number, so wiping a card can't free it; this can.
    Each child's next card tap links that card afresh. Nothing else is touched.
    """
    count = len(session.exec(select(CardLink)).all())
    session.exec(delete(CardLink))  # type: ignore[call-overload]
    session.commit()
    return UnlinkResult(unlinked=count)
