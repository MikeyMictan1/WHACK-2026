"""Rewards shop and the purchase flow: child asks, parent approves, child taps their card.

Parents:  manage rewards, approve/deny requests, see balances, give bonuses.
Children: browse their parent's rewards, request one, pay by tapping their NFC card.
"""

import threading

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.controllers.deps import CurrentParent, CurrentUser
from app.controllers.nfc_controller import require_own_card, wait_for_card_tap
from app.core.config import settings
from app.core.database import SessionDep
from app.models.shop import (
    OPEN_STATUSES,
    BonusCreate,
    CardLink,
    LedgerEntry,
    LedgerEntryPublic,
    PurchaseRequest,
    PurchaseRequestCreate,
    PurchaseRequestPublic,
    Reward,
    RewardCreate,
    RewardPublic,
    Wallet,
    add_entry,
    add_starter_items,
    balance_of,
    expire_if_stale,
    expires_in,
    open_request_for,
    set_status_if,
    utcnow,
    weekly_available_again,
)
from app.models.led import ensure_skin_rewards, owned_skins, skin_for_reward
from app.models.user import User, get_child, list_children

router = APIRouter(prefix="/shop", tags=["shop"])

TAP_TIMEOUT_SECONDS = 30


def _require_child(user: User) -> User:
    if user.role != "child" or user.parent_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only child accounts can do this")
    return user


def _name(user: User | None) -> str:
    return (user.display_name or user.username) if user else "Unknown"


def _public(session: Session, req: PurchaseRequest) -> PurchaseRequestPublic:
    assert req.id is not None
    return PurchaseRequestPublic(
        id=req.id,
        child_id=req.child_id,
        child_name=_name(session.get(User, req.child_id)),
        reward_id=req.reward_id,
        title=req.title,
        price=req.price,
        kind=req.kind,
        status=req.status,
        created_at=req.created_at,
        expires_in_seconds=expires_in(req),
    )


def _request_for(session: Session, user: User, request_id: int) -> PurchaseRequest:
    """The request, if this user is its child or that child's parent."""
    req = session.get(PurchaseRequest, request_id)
    if req is not None:
        child = session.get(User, req.child_id)
        if child is not None and user.id in (child.id, child.parent_id):
            return expire_if_stale(session, req)
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase request not found")


# ---- rewards -----------------------------------------------------------------

@router.get("/rewards", response_model=list[RewardPublic])
def list_rewards(user: CurrentUser, session: SessionDep) -> list[RewardPublic]:
    """Parent: their catalogue. Child: their parent's catalogue, with weekly availability."""
    owner_id = user.id if user.role == "parent" else user.parent_id
    if owner_id is not None:
        ensure_skin_rewards(session, owner_id)  # LED skins appear in every family's shop
    skins_owned = owned_skins(session, user) if user.role == "child" else set()
    rewards = session.exec(
        select(Reward).where(Reward.parent_id == owner_id, col(Reward.active)).order_by(col(Reward.price))
    ).all()
    out = []
    for r in rewards:
        assert r.id is not None
        again = None
        if user.role == "child" and r.kind == "weekly":
            assert user.id is not None
            again = weekly_available_again(session, user.id, r.id)
        owned = r.kind == "led_skin" and skin_for_reward(session, r.id) in skins_owned
        out.append(RewardPublic(**r.model_dump(), available_again_at=again, owned=owned))
    return out


@router.post("/rewards", response_model=RewardPublic, status_code=status.HTTP_201_CREATED)
def create_reward(data: RewardCreate, parent: CurrentParent, session: SessionDep) -> Reward:
    assert parent.id is not None
    reward = Reward(parent_id=parent.id, **data.model_dump())
    session.add(reward)
    session.commit()
    session.refresh(reward)
    return reward


@router.delete("/rewards/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_reward(reward_id: int, parent: CurrentParent, session: SessionDep) -> None:
    reward = session.get(Reward, reward_id)
    if reward is None or reward.parent_id != parent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reward not found")
    reward.active = False  # keep it so past purchases still make sense
    session.add(reward)
    session.commit()


@router.post("/starter-pack", status_code=status.HTTP_204_NO_CONTENT)
def starter_pack(parent: CurrentParent, session: SessionDep) -> None:
    """Add the example rewards and chores (PS5 milestone, cinema trip, ...)."""
    assert parent.id is not None
    add_starter_items(session, parent.id)


# ---- money -------------------------------------------------------------------

@router.get("/wallet", response_model=Wallet)
def wallet(user: CurrentUser, session: SessionDep) -> Wallet:
    child = _require_child(user)
    assert child.id is not None
    entries = session.exec(
        select(LedgerEntry)
        .where(LedgerEntry.child_id == child.id)
        .order_by(col(LedgerEntry.created_at).desc())
        .limit(20)
    ).all()
    owned = session.exec(
        select(PurchaseRequest)
        .where(PurchaseRequest.child_id == child.id, PurchaseRequest.status == "paid")
        .order_by(col(PurchaseRequest.paid_at).desc())
    ).all()
    card = session.exec(select(CardLink).where(CardLink.child_id == child.id)).first()
    return Wallet(
        balance=balance_of(session, child.id),
        entries=[LedgerEntryPublic(**e.model_dump()) for e in entries],  # type: ignore[arg-type]
        owned=[_public(session, r) for r in owned],
        card_linked=card is not None,
    )


@router.get("/balances")
def balances(parent: CurrentParent, session: SessionDep) -> dict[int, int]:
    """Each child's balance, keyed by child id."""
    assert parent.id is not None
    return {c.id: balance_of(session, c.id) for c in list_children(session, parent.id) if c.id is not None}


@router.post("/bonus", status_code=status.HTTP_204_NO_CONTENT)
def give_bonus(data: BonusCreate, parent: CurrentParent, session: SessionDep) -> None:
    assert parent.id is not None
    if get_child(session, parent.id, data.child_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child account not found")
    add_entry(session, child_id=data.child_id, amount=data.amount, kind="bonus", description=data.note or "Bonus")
    session.commit()


# ---- purchase requests -------------------------------------------------------

@router.post("/requests", response_model=PurchaseRequestPublic, status_code=status.HTTP_201_CREATED)
def request_purchase(data: PurchaseRequestCreate, user: CurrentUser, session: SessionDep) -> PurchaseRequestPublic:
    child = _require_child(user)
    assert child.id is not None
    reward = session.get(Reward, data.reward_id)
    if reward is None or reward.parent_id != child.parent_id or not reward.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That item isn't in your shop")
    assert reward.id is not None

    if open_request_for(session, child.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a purchase in progress")
    if reward.kind == "weekly" and (again := weekly_available_again(session, child.id, reward.id)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can buy this again on {again:%A %d %B}")
    if reward.kind == "led_skin" and skin_for_reward(session, reward.id) in owned_skins(session, child):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already own this skin")
    if balance_of(session, child.id) < reward.price:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You don't have enough money for this yet")

    req = PurchaseRequest(
        child_id=child.id, reward_id=reward.id, title=reward.title, price=reward.price, kind=reward.kind
    )
    session.add(req)
    session.commit()
    session.refresh(req)
    return _public(session, req)


@router.get("/requests", response_model=list[PurchaseRequestPublic])
def list_requests(user: CurrentUser, session: SessionDep, only_open: bool = False) -> list[PurchaseRequestPublic]:
    """Parent: requests from all their kids. Child: their own. Newest first, last 30."""
    if user.role == "parent":
        assert user.id is not None
        child_ids = [c.id for c in list_children(session, user.id)]
    else:
        child_ids = [user.id]
    query = select(PurchaseRequest).where(col(PurchaseRequest.child_id).in_(child_ids))
    if only_open:
        query = query.where(col(PurchaseRequest.status).in_(OPEN_STATUSES))
    reqs = session.exec(query.order_by(col(PurchaseRequest.created_at).desc()).limit(30)).all()
    reqs = [expire_if_stale(session, r) for r in reqs]
    if only_open:
        reqs = [r for r in reqs if r.status in OPEN_STATUSES]
    return [_public(session, r) for r in reqs]


@router.get("/requests/{request_id}", response_model=PurchaseRequestPublic)
def get_request(request_id: int, user: CurrentUser, session: SessionDep) -> PurchaseRequestPublic:
    return _public(session, _request_for(session, user, request_id))


def _decide(request_id: int, parent: User, session: Session, new_status: str) -> PurchaseRequestPublic:
    req = _request_for(session, parent, request_id)
    if req.child_id == parent.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a parent can decide this")
    if req.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {req.status}")
    assert req.id is not None
    if not set_status_if(session, req.id, ("pending",), new_status, decided_at=utcnow()):
        session.rollback()
        session.refresh(req)  # the child cancelled, or it expired, while we were deciding
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {req.status}")
    session.commit()
    session.refresh(req)
    return _public(session, req)


@router.post("/requests/{request_id}/approve", response_model=PurchaseRequestPublic)
def approve(request_id: int, parent: CurrentParent, session: SessionDep) -> PurchaseRequestPublic:
    return _decide(request_id, parent, session, "approved")


@router.post("/requests/{request_id}/deny", response_model=PurchaseRequestPublic)
def deny(request_id: int, parent: CurrentParent, session: SessionDep) -> PurchaseRequestPublic:
    return _decide(request_id, parent, session, "denied")


@router.post("/requests/{request_id}/cancel", response_model=PurchaseRequestPublic)
def cancel(request_id: int, user: CurrentUser, session: SessionDep) -> PurchaseRequestPublic:
    req = _request_for(session, user, request_id)
    if req.status not in OPEN_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {req.status}")
    assert req.id is not None
    if not set_status_if(session, req.id, OPEN_STATUSES, "cancelled"):
        session.rollback()
        session.refresh(req)  # it was paid (or decided) a moment ago: a paid purchase can't be cancelled
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {req.status}")
    session.commit()
    session.refresh(req)
    return _public(session, req)


# ---- paying: tap the card ----------------------------------------------------

_pending_taps: dict[int, threading.Event] = {}  # request id -> cancel flag
_taps_lock = threading.Lock()


@router.post("/requests/{request_id}/pay", response_model=PurchaseRequestPublic)
def pay(request_id: int, user: CurrentUser, session: SessionDep, simulate: bool = False) -> PurchaseRequestPublic:
    """Wait (up to 30 s) for the child to tap their card on the reader, then take the money.

    `simulate=true` skips the card (no reader at hand, or demo backup).
    """
    child = _require_child(user)
    assert child.id is not None
    req = _request_for(session, child, request_id)
    if req.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "This purchase isn't approved yet")

    if simulate:
        if not settings.allow_simulated_tap:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Simulated taps are turned off")
    else:
        cancel_flag = threading.Event()
        with _taps_lock:
            if old := _pending_taps.get(request_id):
                old.set()
            _pending_taps[request_id] = cancel_flag
        try:
            uid = wait_for_card_tap(cancel_flag, TAP_TIMEOUT_SECONDS)
        finally:
            with _taps_lock:
                if _pending_taps.get(request_id) is cancel_flag:
                    del _pending_taps[request_id]
        require_own_card(session, child.id, uid)

    session.refresh(req)  # the parent could have changed it while we waited
    if req.status != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This purchase is {req.status}")

    # Win the purchase first. One UPDATE decides, so if the child's taps, retries or double clicks reach
    # us together, exactly one gets to charge. The others find it already paid and stop here.
    assert req.id is not None
    try:
        won = set_status_if(session, req.id, ("approved",), "paid", paid_at=utcnow())
    except IntegrityError:  # two first taps racing to link the same card: the other one got there first
        won = False
    if not won:
        session.rollback()
        session.refresh(req)
        raise HTTPException(status.HTTP_409_CONFLICT, f"This purchase is {req.status}")
    # Still inside the same transaction: if they cannot afford it, leaving here undoes the claim above.
    if balance_of(session, child.id) < req.price:
        session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You don't have enough money for this any more")

    add_entry(session, child_id=child.id, amount=-req.price, kind="purchase", description=req.title)
    session.commit()  # the status, the money and (on a first tap) the card link land together
    session.refresh(req)
    return _public(session, req)


@router.post("/requests/{request_id}/pay/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_pay(request_id: int, user: CurrentUser, session: SessionDep) -> None:
    """Stop waiting for a tap (the "Back" button). The request stays approved."""
    _request_for(session, user, request_id)
    with _taps_lock:
        if flag := _pending_taps.get(request_id):
            flag.set()
