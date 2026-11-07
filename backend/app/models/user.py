from datetime import datetime
from typing import Literal

from pydantic import field_validator
from sqlalchemy import event
from sqlmodel import Field, Session, SQLModel, select

from app.models.clock import site_now
from app.models.milestone import MilestoneInput, MilestonePublic
from app.models.weekly_item import WeeklyItemInput, WeeklyItemPublic

USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]{3,32}$"

# "admin" is never created through the API: ensure_admin() seeds the single admin at startup.
Role = Literal["parent", "child", "admin"]


# ---- Table -----------------------------------------------------------------

class User(SQLModel, table=True):
    """Parents sign up themselves; children are created by a parent (parent_id set)."""

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=32)
    hashed_password: str
    role: str = Field(default="parent", index=True)  # Role
    parent_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    display_name: str | None = Field(default=None, max_length=40)
    weekly_allowance: int | None = None  # children only, minor units (1/100 WC)
    app_experience: str | None = Field(default=None, max_length=20)  # children only
    card_type: str | None = Field(default=None, max_length=100)  # children only: comma-separated
    created_at: datetime = Field(default_factory=lambda: site_now())


@event.listens_for(User, "before_delete")
def _keep_admin(_mapper: object, _connection: object, target: User) -> None:
    """The admin account can't be deleted through the app."""
    if target.role == "admin":
        raise ValueError("The admin account can't be deleted")


# ---- Schemas (API input / output) -----------------------------------------

class UserCreate(SQLModel):
    """Sign-up form. Always creates a parent account."""

    username: str = Field(regex=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=40)

    @field_validator("username")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class UserLogin(SQLModel):
    username: str
    password: str


class UserPublic(SQLModel):
    id: int
    username: str
    role: str
    parent_id: int | None
    display_name: str | None
    weekly_allowance: int | None
    app_experience: str | None
    card_type: str | None
    created_at: datetime


class ChildPublic(UserPublic):
    """A child as their parent sees it, with the weekly items they can order."""

    weekly_items: list[WeeklyItemPublic] = []
    milestones: list[MilestonePublic] = []


class ChildCreate(SQLModel):
    username: str = Field(regex=USERNAME_PATTERN)
    # Shorter minimum than parents so a kid can remember it (a PIN works).
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=40)
    weekly_allowance: int = Field(ge=0)  # minor units
    app_experience: str = Field(min_length=1, max_length=20)
    card_type: str = Field(max_length=100)
    weekly_items: list[WeeklyItemInput] = []
    milestones: list[MilestoneInput] = []

    @field_validator("username")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class ChildUpdate(SQLModel):
    """Every field optional; only the ones sent are changed."""

    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    weekly_allowance: int | None = Field(default=None, ge=0)
    app_experience: str | None = Field(default=None, min_length=1, max_length=20)
    card_type: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, min_length=4, max_length=128)
    weekly_items: list[WeeklyItemInput] | None = None  # replaces the whole list when sent
    milestones: list[MilestoneInput] | None = None  # replaces the whole list when sent


# ---- Data access -----------------------------------------------------------

def get_user_by_username(session: Session, username: str) -> User | None:
    return session.exec(select(User).where(User.username == username.lower())).first()


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def create_user(
    session: Session,
    *,
    username: str,
    hashed_password: str,
    role: Role = "parent",
    parent_id: int | None = None,
    display_name: str | None = None,
    weekly_allowance: int | None = None,
    app_experience: str | None = None,
    card_type: str | None = None,
) -> User:
    user = User(
        username=username.lower(),
        hashed_password=hashed_password,
        role=role,
        parent_id=parent_id,
        display_name=display_name,
        weekly_allowance=weekly_allowance,
        app_experience=app_experience,
        card_type=card_type,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ensure_admin(session: Session, username: str, password: str) -> User:
    """Make sure the built-in admin exists with this username, role and password. Runs at startup,
    so the account comes back if it was removed from the database by hand."""
    from app.core.security import hash_password, verify_password

    user = get_user_by_username(session, username)
    if user is None:
        user = User(username=username.lower(), hashed_password=hash_password(password), role="admin")
    else:
        # Also covers someone having registered the admin username before this existed.
        user.role = "admin"
        user.parent_id = None
        try:
            password_ok = verify_password(password, user.hashed_password)
        except Exception:  # unreadable hash (edited by hand): just reset it
            password_ok = False
        if not password_ok:
            user.hashed_password = hash_password(password)
    if user.display_name is None:
        user.display_name = "Admin"
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def list_children(session: Session, parent_id: int) -> list[User]:
    query = select(User).where(User.parent_id == parent_id).order_by(User.created_at)  # type: ignore[arg-type]
    return list(session.exec(query))


def get_child(session: Session, parent_id: int, child_id: int) -> User | None:
    """The child, but only if it belongs to this parent."""
    child = session.get(User, child_id)
    if child is None or child.parent_id != parent_id:
        return None
    return child
