"""Play money: rewards shop, chores, purchase requests and the money ledger.

All amounts are integers in the smallest unit (pence). The currency is display-only.

Purchase flow (PurchaseRequest.status):
    pending  -> child asked, waiting for the parent
    approved -> parent said yes, waiting for the child to tap their NFC card
    paid     -> card tapped, money taken, item owned
    denied | cancelled | expired  (end states)
"""

from datetime import datetime, timedelta
from typing import Literal

from sqlmodel import Field, Session, SQLModel, col, func, select

from app.models.clock import site_now

RewardKind = Literal["in_game", "weekly", "milestone", "led_skin"]
ChoreKind = Literal["chore", "extracurricular"]
EntryKind = Literal["chore", "purchase", "bonus", "allowance"]

REQUEST_TTL = timedelta(minutes=15)  # pending/approved requests expire after this
WEEKLY_COOLDOWN = timedelta(days=7)
OPEN_STATUSES = ("pending", "approved")


def utcnow() -> datetime:
    """The site clock's now (UTC, timezone-aware), not the real time. See models/clock.py."""
    return site_now()


# ---- Tables ------------------------------------------------------------------

class Reward(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    parent_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(max_length=60)
    description: str = Field(default="", max_length=200)
    price: int  # pence
    kind: str = "in_game"  # RewardKind
    active: bool = True  # removed items are hidden, kept for history
    created_at: datetime = Field(default_factory=utcnow)


class Chore(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    parent_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(max_length=60)
    amount: int  # pence paid when approved
    kind: str = "chore"  # ChoreKind
    active: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class ChoreClaim(SQLModel, table=True):
    """Child says "I did it"; parent approves (money paid) or denies."""

    id: int | None = Field(default=None, primary_key=True)
    chore_id: int = Field(foreign_key="chore.id", index=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    status: str = "pending"  # pending | approved | denied
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: datetime | None = None


class PurchaseRequest(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    reward_id: int = Field(foreign_key="reward.id")
    title: str  # copied so history survives the reward being edited/removed
    price: int
    kind: str
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: datetime | None = None
    paid_at: datetime | None = None


class LedgerEntry(SQLModel, table=True):
    """Every money movement. Balance = sum(amount). Positive in, negative out."""

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    amount: int
    kind: str  # EntryKind
    description: str = Field(max_length=120)
    created_at: datetime = Field(default_factory=utcnow)


class CardLink(SQLModel, table=True):
    """Which NFC card belongs to which child. Linked on the child's first tap-to-pay."""

    uid: str = Field(primary_key=True)
    child_id: int = Field(foreign_key="user.id", unique=True)
    linked_at: datetime = Field(default_factory=utcnow)


# ---- Schemas -----------------------------------------------------------------

class RewardCreate(SQLModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=200)
    price: int = Field(gt=0, le=10_000_000)
    kind: RewardKind = "in_game"


class RewardPublic(SQLModel):
    id: int
    title: str
    description: str
    price: int
    kind: str
    # Child view only: weekly items can be bought once a week.
    available_again_at: datetime | None = None
    # Child view only: one-off items (LED skins) they already have.
    owned: bool = False


class ChoreCreate(SQLModel):
    title: str = Field(min_length=1, max_length=60)
    amount: int = Field(gt=0, le=1_000_000)
    kind: ChoreKind = "chore"


class ChorePublic(SQLModel):
    id: int
    title: str
    amount: int
    kind: str
    # Child view only: status of their latest claim for this chore today-ish.
    my_claim_status: str | None = None


class ChoreClaimPublic(SQLModel):
    id: int
    chore_id: int
    child_id: int
    child_name: str
    title: str
    amount: int
    status: str
    created_at: datetime


class PurchaseRequestPublic(SQLModel):
    id: int
    child_id: int
    child_name: str
    reward_id: int
    title: str
    price: int
    kind: str
    status: str
    created_at: datetime
    expires_in_seconds: int | None  # for pending/approved


class LedgerEntryPublic(SQLModel):
    id: int
    amount: int
    kind: str
    description: str
    created_at: datetime


class Wallet(SQLModel):
    balance: int
    entries: list[LedgerEntryPublic]
    owned: list[PurchaseRequestPublic]
    card_linked: bool


class PurchaseRequestCreate(SQLModel):
    reward_id: int


class BonusCreate(SQLModel):
    child_id: int
    amount: int = Field(gt=0, le=1_000_000)
    note: str = Field(default="Bonus", max_length=80)


# ---- Data access -------------------------------------------------------------

def balance_of(session: Session, child_id: int) -> int:
    total = session.exec(select(func.sum(LedgerEntry.amount)).where(LedgerEntry.child_id == child_id)).one()
    return int(total or 0)


def add_entry(session: Session, *, child_id: int, amount: int, kind: EntryKind, description: str) -> None:
    session.add(LedgerEntry(child_id=child_id, amount=amount, kind=kind, description=description[:120]))


def _expires_at(req: PurchaseRequest) -> datetime:
    """The clock restarts when the parent approves, so the child always gets the full time to tap."""
    start = req.decided_at if req.status == "approved" and req.decided_at else req.created_at
    return start + REQUEST_TTL


def expire_if_stale(session: Session, req: PurchaseRequest) -> PurchaseRequest:
    """Requests left pending or approved too long expire. Called whenever one is read."""
    if req.status in OPEN_STATUSES and utcnow() > _expires_at(req):
        req.status = "expired"
        session.add(req)
        session.commit()
        session.refresh(req)
    return req


def expires_in(req: PurchaseRequest) -> int | None:
    if req.status not in OPEN_STATUSES:
        return None
    return max(0, int((_expires_at(req) - utcnow()).total_seconds()))


def weekly_available_again(session: Session, child_id: int, reward_id: int) -> datetime | None:
    """When a weekly item can next be bought by this child, or None if it can be bought now."""
    last = session.exec(
        select(PurchaseRequest)
        .where(PurchaseRequest.child_id == child_id, PurchaseRequest.reward_id == reward_id)
        .where(col(PurchaseRequest.status) == "paid")
        .order_by(col(PurchaseRequest.paid_at).desc())
    ).first()
    if last is None or last.paid_at is None:
        return None
    again = last.paid_at + WEEKLY_COOLDOWN
    return again if again > utcnow() else None


def open_request_for(session: Session, child_id: int) -> PurchaseRequest | None:
    for req in session.exec(
        select(PurchaseRequest)
        .where(PurchaseRequest.child_id == child_id)
        .where(col(PurchaseRequest.status).in_(OPEN_STATUSES))
    ):
        if expire_if_stale(session, req).status in OPEN_STATUSES:
            return req
    return None


# ---- NFC cards ---------------------------------------------------------------

class CardError(Exception):
    """A tapped card that can't be used here (someone else's, or not this child's card)."""


def normalize_uid(uid: str) -> str:
    """One format for card ids, whoever read them: '04:a2:3b' (phone) and '04A23B' (reader) -> '04A23B'."""
    return "".join(ch for ch in uid if ch.isalnum()).upper()


def child_for_card(session: Session, uid: str) -> int | None:
    link = session.get(CardLink, normalize_uid(uid))
    return link.child_id if link else None


def check_card(session: Session, child_id: int, uid: str) -> None:
    """The card must be this child's. A child's first card, if nobody owns it, is linked to them.

    Raises CardError. Adds the link to the session; the caller commits.
    """
    uid = normalize_uid(uid)
    owner = child_for_card(session, uid)
    if owner is not None:
        if owner != child_id:
            raise CardError("That card belongs to someone else")
        return
    if session.exec(select(CardLink).where(CardLink.child_id == child_id)).first():
        raise CardError("That isn't your card. Tap the card you used before.")
    session.add(CardLink(uid=uid, child_id=child_id))


# ---- Example items for new parents ("mocks") ---------------------------------

STARTER_REWARDS: list[tuple[str, str, int, RewardKind]] = [
    ("Dark mode theme", "Switch your dashboard to dark mode", 150, "in_game"),
    ("Rocket app icon", "A rocket icon for your app", 100, "in_game"),
    ("Mascot party hat", "Decor for your dashboard side panel", 80, "in_game"),
    ("Cinema trip", "One film at the weekend", 800, "weekly"),
    ("Snack of your choice", "Pick any snack from the shop", 200, "weekly"),
    ("Extra hour of gaming", "One extra hour this week", 300, "weekly"),
    ("PS5", "Save up for a PlayStation 5", 45000, "milestone"),
    ("New football boots", "Any pair up to this price", 6000, "milestone"),
    ("Concert tickets", "Tickets to a gig of your choice", 7500, "milestone"),
]

STARTER_CHORES: list[tuple[str, int, ChoreKind]] = [
    ("Wash the dishes", 200, "chore"),
    ("Tidy your room", 150, "chore"),
    ("Take out the bins", 100, "chore"),
    ("Walk the dog", 250, "chore"),
    ("Football practice", 300, "extracurricular"),
    ("Music lesson", 300, "extracurricular"),
    ("Finish a book", 500, "extracurricular"),
]


def add_starter_items(session: Session, parent_id: int) -> None:
    for title, description, price, kind in STARTER_REWARDS:
        session.add(Reward(parent_id=parent_id, title=title, description=description, price=price, kind=kind))
    for title, amount, kind in STARTER_CHORES:
        session.add(Chore(parent_id=parent_id, title=title, amount=amount, kind=kind))
    session.commit()
