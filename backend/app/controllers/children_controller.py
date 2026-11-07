"""A parent's child accounts: list, create, edit (incl. password reset and weekly items), delete."""

from fastapi import APIRouter, HTTPException, status

from app.controllers.deps import CurrentParent
from app.core.database import SessionDep
from app.core.security import hash_password
from app.models.user import (
    ChildCreate,
    ChildPublic,
    ChildUpdate,
    User,
    create_user,
    get_child,
    get_user_by_username,
    list_children,
)
from sqlmodel import col, delete, select

from app.models.card import STARTER_CARD_ID, CreditProfile, get_card
from app.models.credit import CreditEntry, Statement
from app.models.help import HelpMessage
from app.models.milestone import delete_milestones, list_milestones, replace_milestones
from app.models.recap import Recap
from app.models.score import ScoreEvent
from app.models.negotiation import NegotiationMessage, NegotiationSession
from app.models.shop import CardLink, ChoreClaim, LedgerEntry, PurchaseRequest
from app.models.vault import Vault
from app.models.weekly_item import delete_weekly_items, list_weekly_items, replace_weekly_items

router = APIRouter(prefix="/children", tags=["children"])


def _own_child(session: SessionDep, parent: User, child_id: int) -> User:
    assert parent.id is not None
    child = get_child(session, parent.id, child_id)
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child account not found")
    return child


def _public(session: SessionDep, child: User) -> ChildPublic:
    assert child.id is not None
    return ChildPublic.model_validate(
        {
            **child.model_dump(),
            "weekly_items": [i.model_dump() for i in list_weekly_items(session, child.id)],
            "milestones": [m.model_dump() for m in list_milestones(session, child.id)],
        }
    )


@router.get("", response_model=list[ChildPublic])
def my_children(parent: CurrentParent, session: SessionDep) -> list[ChildPublic]:
    assert parent.id is not None
    return [_public(session, c) for c in list_children(session, parent.id)]


@router.post("", response_model=ChildPublic, status_code=status.HTTP_201_CREATED)
def add_child(data: ChildCreate, parent: CurrentParent, session: SessionDep) -> ChildPublic:
    if get_user_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    child = create_user(
        session,
        username=data.username,
        hashed_password=hash_password(data.password),
        role="child",
        parent_id=parent.id,
        display_name=data.display_name.strip(),
        weekly_allowance=data.weekly_allowance,
        app_experience=data.app_experience,
        card_type=data.card_type,
        starting_credit_limit=data.starting_credit_limit,
    )
    assert child.id is not None
    replace_weekly_items(session, child.id, data.weekly_items)
    replace_milestones(session, child.id, data.milestones)
    session.commit()
    return _public(session, child)


@router.patch("/{child_id}", response_model=ChildPublic)
def update_child(child_id: int, data: ChildUpdate, parent: CurrentParent, session: SessionDep) -> ChildPublic:
    child = _own_child(session, parent, child_id)
    if data.display_name is not None:
        child.display_name = data.display_name.strip()
    if data.weekly_allowance is not None:
        child.weekly_allowance = data.weekly_allowance
    if data.app_experience is not None:
        child.app_experience = data.app_experience
    if data.card_type is not None:
        child.card_type = data.card_type
    if data.password is not None:
        child.hashed_password = hash_password(data.password)
    if "starting_credit_limit" in data.model_fields_set:  # null is a real value here: back to the card's own limit
        child.starting_credit_limit = data.starting_credit_limit
        profile = session.get(CreditProfile, child_id)
        starter = get_card(session, STARTER_CARD_ID)
        if profile is not None and starter is not None and profile.current_card_id == STARTER_CARD_ID:
            profile.credit_limit = data.starting_credit_limit or starter.credit_limit  # still on that card: change it now
            session.add(profile)
    if data.weekly_items is not None:
        replace_weekly_items(session, child_id, data.weekly_items)
    if data.milestones is not None:
        replace_milestones(session, child_id, data.milestones)
    session.add(child)
    session.commit()
    session.refresh(child)
    return _public(session, child)


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(child_id: int, parent: CurrentParent, session: SessionDep) -> None:
    child = _own_child(session, parent, child_id)
    if vault := session.get(Vault, child.id):
        session.delete(vault)
    delete_weekly_items(session, child_id)
    delete_milestones(session, child_id)
    for table in (LedgerEntry, PurchaseRequest, ChoreClaim, CardLink, CreditEntry, Statement, ScoreEvent, Recap):
        session.exec(delete(table).where(table.child_id == child.id))  # type: ignore[call-overload]
    negotiation_ids = session.exec(select(NegotiationSession.id).where(NegotiationSession.user_id == child.id)).all()
    if negotiation_ids:
        session.exec(delete(NegotiationMessage).where(col(NegotiationMessage.session_id).in_(negotiation_ids)))
    session.exec(delete(NegotiationSession).where(NegotiationSession.user_id == child.id))
    session.exec(delete(HelpMessage).where(HelpMessage.user_id == child.id))
    if profile := session.get(CreditProfile, child.id):
        session.delete(profile)
    session.delete(child)
    session.commit()
