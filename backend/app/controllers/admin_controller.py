"""Admin-only views across every family."""

from fastapi import APIRouter
from sqlmodel import SQLModel, select

from app.controllers.deps import CurrentAdmin
from app.core.database import SessionDep
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
