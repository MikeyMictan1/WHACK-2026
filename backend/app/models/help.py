"""Everything the AI helper was asked and answered, so a parent can read it later (DESIGN.md section 9)."""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.clock import site_now


class HelpMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="user.id", index=True)  # None when logged out
    page: str = ""
    question: str
    answer: str
    scripted: bool = False  # True if the offline fallback answered
    created_at: datetime = Field(default_factory=lambda: site_now())  # site clock
