"""The child's monthly wrap, shown at the top of the Monthly review.

  GET  /api/story        the story for their latest statement (written on first ask); null before the first statement
  POST /api/story/retry  swap a built-in story for an AI one once Claude is reachable again
"""

from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.controllers.deps import CurrentChild
from app.core.database import SessionDep
from app.core.story_bot import retry_story, story_for
from app.models.story import MonthlyStory

router = APIRouter(prefix="/story", tags=["story"])


class StoryOut(BaseModel):
    statement_number: int
    created_at: datetime
    headline: str
    story: str
    tip: str
    scripted: bool  # True when the built-in summary wrote it instead of the AI


def _out(s: MonthlyStory | None) -> StoryOut | None:
    if s is None:
        return None
    return StoryOut(
        statement_number=s.statement_number, created_at=s.created_at, headline=s.headline, story=s.story, tip=s.tip,
        scripted=s.scripted,
    )


@router.get("")
def my_story(child: CurrentChild, session: SessionDep) -> StoryOut | None:
    return _out(story_for(session, child))


@router.post("/retry")
def retry(child: CurrentChild, session: SessionDep) -> StoryOut | None:
    return _out(retry_story(session, child))
