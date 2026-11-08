"""Parent recaps: a short written summary of how a child is using their card (docs/DESIGN.md sections 3 and 9).

The numbers in a recap come from the backend (models/breakdown.py); Claude only turns them into sentences.
Recaps are saved so a parent can look back, and so the AI isn't asked again for the same moment.
"""

import json
from datetime import datetime

from sqlmodel import Field, Session, SQLModel, col, select

from app.models.clock import site_now


class Recap(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    child_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: site_now(), index=True)  # the site clock, like the rest
    headline: str = Field(max_length=200)
    spending: str = Field(max_length=800)
    credit: str = Field(max_length=800)
    praise: str = Field(max_length=400)
    talk_about: str = "[]"  # JSON list of conversation starters
    scripted: bool = False  # True if the built-in summary wrote it (the AI was unavailable or failed a check)

    def talk_points(self) -> list[str]:
        try:
            items = json.loads(self.talk_about)
        except ValueError:
            return []
        return [str(i) for i in items] if isinstance(items, list) else []


def latest_recap(session: Session, child_id: int) -> Recap | None:
    return session.exec(select(Recap).where(Recap.child_id == child_id).order_by(col(Recap.id).desc())).first()
