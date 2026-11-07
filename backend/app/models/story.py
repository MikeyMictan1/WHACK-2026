"""The monthly wrap: a short story of the child's month, shown at the top of their Monthly review.

One is saved per statement and per state of that statement (open, paid, carried, late), so opening the page does not call
the AI again, and paying the statement earns a fresh story that can say so. The numbers come from the backend
(core/story_bot.py); Claude only writes the sentences.
"""

from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Session, SQLModel, col, select

from app.models.clock import site_now


class MonthlyStory(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("child_id", "statement_number", "statement_status"),)

    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    statement_number: int
    statement_status: str
    created_at: datetime = Field(default_factory=lambda: site_now())
    headline: str = Field(max_length=200)
    story: str = Field(max_length=900)
    tip: str = Field(max_length=400)
    scripted: bool = False  # True when the built-in summary wrote it (the AI was unavailable or failed a check)


def find_story(session: Session, child_id: int, number: int, status: str) -> MonthlyStory | None:
    return session.exec(
        select(MonthlyStory).where(
            MonthlyStory.child_id == child_id,
            MonthlyStory.statement_number == number,
            MonthlyStory.statement_status == status,
        )
    ).first()


def latest_story(session: Session, child_id: int) -> MonthlyStory | None:
    return session.exec(select(MonthlyStory).where(MonthlyStory.child_id == child_id).order_by(col(MonthlyStory.id).desc())).first()
