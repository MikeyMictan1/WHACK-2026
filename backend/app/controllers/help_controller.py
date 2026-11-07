"""The AI helper behind the "Ask" button. Open to everyone; signed-in children get answers that
know their own score and plan. Every exchange is saved (models/help.py) so a parent can read it."""

import threading
import time
from collections import defaultdict, deque
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.controllers.deps import get_current_user_or_none
from app.core import help_bot
from app.core.database import SessionDep
from app.models.card import get_card, get_profile
from app.models.help import HelpMessage
from app.models.user import User

router = APIRouter(prefix="/help", tags=["help"])

MAX_PER_WINDOW = 20
WINDOW_SECONDS = 600
HISTORY_TURNS = 6

_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()

MaybeUser = Annotated[User | None, Depends(get_current_user_or_none)]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=1000)


class HelpIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    history: list[Turn] = Field(default_factory=list, max_length=12)
    page: str = Field(default="", max_length=100)


class TopicLink(BaseModel):
    id: str
    title: str


class HelpOut(BaseModel):
    reply: str
    topics: list[TopicLink]
    scripted: bool


def _rate_limit(key: str) -> None:
    now = time.monotonic()
    with _hits_lock:
        hits = _hits[key]
        while hits and now - hits[0] > WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= MAX_PER_WINDOW:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "You have asked a lot of questions. Take a short break and try again.")
        hits.append(now)


def _clean_history(turns: list[Turn]) -> list[tuple[str, str]]:
    """Keep the last few turns, starting with a question and alternating, ending on an answer."""
    out: list[tuple[str, str]] = []
    for t in turns[-HISTORY_TURNS:]:
        text = t.text.strip()
        if not text or (not out and t.role != "user"):
            continue
        if out and out[-1][0] == t.role:
            out[-1] = (t.role, text)
        else:
            out.append((t.role, text))
    if out and out[-1][0] == "user":
        out.pop()
    return out


@router.post("/chat")
def chat(body: HelpIn, request: Request, user: MaybeUser, db: SessionDep) -> HelpOut:
    key = f"user:{user.id}" if user else f"ip:{request.client.host if request.client else 'unknown'}"
    _rate_limit(key)

    message = body.message.strip()
    if not message:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type a question first.")
    page = body.page.split("?")[0].split("#")[0]
    page = page if page in help_bot.PAGES else ""

    facts = None
    if user and user.role == "child" and user.id is not None:
        profile = get_profile(db, user.id)
        card = get_card(db, profile.current_card_id)
        facts = help_bot.ChildFacts(
            age=user.age,
            score=profile.score,
            plan_name=card.name if card else "your",
            apr_bp=profile.current_apr_bp,
            utilisation_pct=round(100 * profile.balance / profile.credit_limit) if profile.credit_limit else 0,
            on_time_streak=profile.on_time_streak,
        )

    scripted = False
    try:
        reply = help_bot.claude_answer(
            message=message, history=_clean_history(body.history), age=user.age if user else None, page=page, facts=facts
        )
    except HTTPException:
        # No key, rate limit or API down: a short scripted answer keeps the helper useful.
        reply, scripted = help_bot.scripted_answer(message), True

    db.add(HelpMessage(user_id=user.id if user else None, page=page, question=message, answer=reply, scripted=scripted))
    db.commit()

    topics = [TopicLink(id=t, title=help_bot.TOPICS[t]) for t in help_bot.suggest_topics(message, reply)]
    return HelpOut(reply=reply, topics=topics, scripted=scripted)
