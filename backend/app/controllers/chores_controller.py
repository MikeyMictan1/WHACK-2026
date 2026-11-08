"""Chores and extracurriculars: parent sets them up, child says "I did it", parent approves and pays."""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, col, select

from app.controllers.deps import CurrentParent, CurrentUser
from app.core.database import SessionDep
from app.models.shop import (
    Chore,
    ChoreClaim,
    ChoreClaimPublic,
    ChoreCreate,
    ChorePublic,
    add_entry,
    utcnow,
)
from app.models.pricing import money
from app.models.push import notify
from app.models.user import User, list_children

router = APIRouter(prefix="/chores", tags=["chores"])


def _claim_public(session: Session, claim: ChoreClaim) -> ChoreClaimPublic:
    assert claim.id is not None
    chore = session.get(Chore, claim.chore_id)
    child = session.get(User, claim.child_id)
    return ChoreClaimPublic(
        id=claim.id,
        chore_id=claim.chore_id,
        child_id=claim.child_id,
        child_name=(child.display_name or child.username) if child else "Unknown",
        title=chore.title if chore else "Removed chore",
        amount=chore.amount if chore else 0,
        status=claim.status,
        created_at=claim.created_at,
    )


@router.get("", response_model=list[ChorePublic])
def list_chores(user: CurrentUser, session: SessionDep) -> list[ChorePublic]:
    """Parent: their chores. Child: their parent's chores plus the status of their latest claim."""
    owner_id = user.id if user.role == "parent" else user.parent_id
    chores = session.exec(
        select(Chore).where(Chore.parent_id == owner_id, col(Chore.active)).order_by(col(Chore.created_at))
    ).all()
    out = []
    for c in chores:
        mine = None
        if user.role == "child":
            last = session.exec(
                select(ChoreClaim)
                .where(ChoreClaim.chore_id == c.id, ChoreClaim.child_id == user.id)
                .order_by(col(ChoreClaim.created_at).desc())
            ).first()
            mine = last.status if last else None
        out.append(ChorePublic(**c.model_dump(), my_claim_status=mine))
    return out


@router.post("", response_model=ChorePublic, status_code=status.HTTP_201_CREATED)
def create_chore(data: ChoreCreate, parent: CurrentParent, session: SessionDep) -> Chore:
    assert parent.id is not None
    chore = Chore(parent_id=parent.id, **data.model_dump())
    session.add(chore)
    session.commit()
    session.refresh(chore)
    return chore


@router.delete("/{chore_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_chore(chore_id: int, parent: CurrentParent, session: SessionDep) -> None:
    chore = session.get(Chore, chore_id)
    if chore is None or chore.parent_id != parent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chore not found")
    chore.active = False
    session.add(chore)
    session.commit()


@router.post("/{chore_id}/claim", response_model=ChoreClaimPublic, status_code=status.HTTP_201_CREATED)
def claim_chore(chore_id: int, user: CurrentUser, session: SessionDep) -> ChoreClaimPublic:
    if user.role != "child":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only child accounts can do this")
    chore = session.get(Chore, chore_id)
    if chore is None or chore.parent_id != user.parent_id or not chore.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chore not found")
    waiting = session.exec(
        select(ChoreClaim).where(
            ChoreClaim.chore_id == chore_id, ChoreClaim.child_id == user.id, ChoreClaim.status == "pending"
        )
    ).first()
    if waiting:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already waiting for your parent to check this one")
    assert user.id is not None
    claim = ChoreClaim(chore_id=chore_id, child_id=user.id)
    session.add(claim)
    session.commit()
    session.refresh(claim)
    notify(
        user.parent_id,
        f"{user.display_name or user.username} did: {chore.title}",
        f"Open Teenacredit to approve and pay {money(chore.amount)}.",
    )
    return _claim_public(session, claim)


@router.get("/claims", response_model=list[ChoreClaimPublic])
def list_claims(user: CurrentUser, session: SessionDep, only_pending: bool = False) -> list[ChoreClaimPublic]:
    """Parent: claims from all their kids. Child: their own. Newest first, last 30."""
    if user.role == "parent":
        assert user.id is not None
        child_ids = [c.id for c in list_children(session, user.id)]
    else:
        child_ids = [user.id]
    query = select(ChoreClaim).where(col(ChoreClaim.child_id).in_(child_ids))
    if only_pending:
        query = query.where(ChoreClaim.status == "pending")
    claims = session.exec(query.order_by(col(ChoreClaim.created_at).desc()).limit(30)).all()
    return [_claim_public(session, c) for c in claims]


def _decide(claim_id: int, parent: User, session: Session, approve: bool) -> ChoreClaimPublic:
    claim = session.get(ChoreClaim, claim_id)
    child = session.get(User, claim.child_id) if claim else None
    if claim is None or child is None or child.parent_id != parent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chore claim not found")
    if claim.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {claim.status}")
    claim.status = "approved" if approve else "denied"
    claim.decided_at = utcnow()
    session.add(claim)
    if approve and (chore := session.get(Chore, claim.chore_id)):
        add_entry(session, child_id=claim.child_id, amount=chore.amount, kind="chore", description=chore.title)
    session.commit()
    session.refresh(claim)
    return _claim_public(session, claim)


@router.post("/claims/{claim_id}/approve", response_model=ChoreClaimPublic)
def approve_claim(claim_id: int, parent: CurrentParent, session: SessionDep) -> ChoreClaimPublic:
    return _decide(claim_id, parent, session, approve=True)


@router.post("/claims/{claim_id}/deny", response_model=ChoreClaimPublic)
def deny_claim(claim_id: int, parent: CurrentParent, session: SessionDep) -> ChoreClaimPublic:
    return _decide(claim_id, parent, session, approve=False)
