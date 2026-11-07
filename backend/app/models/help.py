"""Everything the AI helper was asked and answered, so a parent can read it later (DESIGN.md section 9)."""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class HelpMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="user.id", index=True)  # None when logged out
    page: str = ""
    question: str
    answer: str
    scripted: bool = False  # True if the offline fallback answered
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
