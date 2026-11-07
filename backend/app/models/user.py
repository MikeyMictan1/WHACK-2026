from datetime import UTC, datetime

from pydantic import field_validator
from sqlmodel import Field, Session, SQLModel, select

USERNAME_PATTERN = r"^[a-zA-Z0-9_.-]{3,32}$"


# ---- Table -----------------------------------------------------------------

class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=32)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---- Schemas (API input / output) -----------------------------------------

class UserCreate(SQLModel):
    username: str = Field(regex=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)

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
    created_at: datetime


# ---- Data access -----------------------------------------------------------

def get_user_by_username(session: Session, username: str) -> User | None:
    return session.exec(select(User).where(User.username == username.lower())).first()


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def create_user(session: Session, *, username: str, hashed_password: str) -> User:
    user = User(username=username.lower(), hashed_password=hashed_password)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
