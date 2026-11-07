"""A parent's child accounts: list, create, edit (incl. password reset), delete."""

from fastapi import APIRouter, HTTPException, status

from app.controllers.deps import CurrentParent
from app.core.database import SessionDep
from app.core.security import hash_password
from app.models.user import (
    ChildCreate,
    ChildUpdate,
    User,
    UserPublic,
    create_user,
    get_child,
    get_user_by_username,
    list_children,
)
from sqlmodel import delete

from app.models.shop import CardLink, ChoreClaim, LedgerEntry, PurchaseRequest
from app.models.vault import Vault

router = APIRouter(prefix="/children", tags=["children"])


def _own_child(session: SessionDep, parent: User, child_id: int) -> User:
    assert parent.id is not None
    child = get_child(session, parent.id, child_id)
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child account not found")
    return child


@router.get("", response_model=list[UserPublic])
def my_children(parent: CurrentParent, session: SessionDep) -> list[User]:
    assert parent.id is not None
    return list_children(session, parent.id)


@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def add_child(data: ChildCreate, parent: CurrentParent, session: SessionDep) -> User:
    if get_user_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    return create_user(
        session,
        username=data.username,
        hashed_password=hash_password(data.password),
        role="child",
        parent_id=parent.id,
        display_name=data.display_name.strip(),
        age=data.age,
    )


@router.patch("/{child_id}", response_model=UserPublic)
def update_child(child_id: int, data: ChildUpdate, parent: CurrentParent, session: SessionDep) -> User:
    child = _own_child(session, parent, child_id)
    if data.display_name is not None:
        child.display_name = data.display_name.strip()
    if data.age is not None:
        child.age = data.age
    if data.password is not None:
        child.hashed_password = hash_password(data.password)
    session.add(child)
    session.commit()
    session.refresh(child)
    return child


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(child_id: int, parent: CurrentParent, session: SessionDep) -> None:
    child = _own_child(session, parent, child_id)
    if vault := session.get(Vault, child.id):
        session.delete(vault)
    for table in (LedgerEntry, PurchaseRequest, ChoreClaim, CardLink):
        session.exec(delete(table).where(table.child_id == child.id))  # type: ignore[call-overload]
    session.delete(child)
    session.commit()
