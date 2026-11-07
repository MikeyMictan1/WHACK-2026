from datetime import UTC, datetime
from typing import Literal

from pydantic import field_validator
from sqlmodel import Field, Session, SQLModel, select

USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]{3,32}$"

Role = Literal["parent", "child"]
MIN_CHILD_AGE = 10
MAX_CHILD_AGE = 18


# ---- Table -----------------------------------------------------------------

class User(SQLModel, table=True):
    """Parents sign up themselves; children are created by a parent (parent_id set)."""

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=32)
    hashed_password: str
    role: str = Field(default="parent", index=True)  # Role
    parent_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    display_name: str | None = Field(default=None, max_length=40)
    age: int | None = None  # children only
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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
    age: int | None
    created_at: datetime


class ChildCreate(SQLModel):
    username: str = Field(regex=USERNAME_PATTERN)
    # Shorter minimum than parents so a kid can remember it (a PIN works).
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=40)
    age: int = Field(ge=MIN_CHILD_AGE, le=MAX_CHILD_AGE)

    @field_validator("username")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class ChildUpdate(SQLModel):
    """Every field optional; only the ones sent are changed."""

    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    age: int | None = Field(default=None, ge=MIN_CHILD_AGE, le=MAX_CHILD_AGE)
    password: str | None = Field(default=None, min_length=4, max_length=128)


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
    age: int | None = None,
) -> User:
    user = User(
        username=username.lower(),
        hashed_password=hashed_password,
        role=role,
        parent_id=parent_id,
        display_name=display_name,
        age=age,
    )
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
