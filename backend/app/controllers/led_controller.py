"""LED Home: what the Unicorn is showing, and the wardrobe of skins to equip.

A background thread (started in main.lifespan) renders the equipped skin, keeps the latest
frame for the web page, and pushes it to the board when one is plugged in. The page polls
GET /api/led/state, so the screen and the board always show the same frame.
"""

import threading
import time
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, col, select

from app.controllers.deps import CurrentUser
from app.core.config import settings
from app.core.database import SessionDep, engine
from app.core.led_skins import DEFAULT_SKIN, SKINS, Ctx, render, to_hex
from app.core.unicorn import UnicornError, unicorn
from app.models.led import RewardSkin, ensure_skin_rewards, latest_equip, owned_skins, set_equip
from app.models.shop import PurchaseRequest, Reward, balance_of
from app.models.user import User

router = APIRouter(prefix="/led", tags=["led"])

CTX_REFRESH_SECONDS = 3
WEATHER_REFRESH_SECONDS = 600
BOARD_CHECK_SECONDS = 3
SLOW_BOARD_FPS = 1.0  # boards with the old whack_grid.py redraw per pixel


# ---- context: what a skin can show -------------------------------------------

_weather: tuple[float, int] | None = None
_weather_at = 0.0


def _refresh_weather() -> None:
    global _weather
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={settings.weather_lat}&longitude={settings.weather_lon}&current=temperature_2m,weather_code"
    )
    try:
        current = httpx.get(url, timeout=4).json()["current"]
        _weather = (float(current["temperature_2m"]), int(current["weather_code"]))
    except Exception:
        pass  # offline: keep the last reading (or none)


def _weather_now() -> tuple[float, int] | None:
    global _weather_at
    if time.monotonic() - _weather_at > WEATHER_REFRESH_SECONDS or _weather_at == 0:
        _weather_at = time.monotonic()
        threading.Thread(target=_refresh_weather, daemon=True).start()
    return _weather


def context_for(session: Session, user: User | None) -> Ctx:
    ctx = Ctx(now=datetime.now(), weather=_weather_now())
    if user is None or user.role != "child" or user.id is None:
        return ctx
    ctx.balance = balance_of(session, user.id)
    bought = set(
        session.exec(
            select(PurchaseRequest.reward_id).where(
                PurchaseRequest.child_id == user.id, PurchaseRequest.status == "paid"
            )
        ).all()
    )
    milestones = session.exec(
        select(Reward)
        .where(Reward.parent_id == user.parent_id, Reward.kind == "milestone", col(Reward.active))
        .order_by(col(Reward.price))
    ).all()
    goal = next((m for m in milestones if m.id not in bought), None)
    if goal:
        ctx.goal_title = goal.title
        ctx.goal_progress = min(1.0, ctx.balance / goal.price)
    return ctx


# ---- the display loop --------------------------------------------------------

class LedDisplay:
    def __init__(self) -> None:
        self.skin = DEFAULT_SKIN
        self.owner_id: int | None = None
        self.owner_name: str | None = None
        self.frame = render(DEFAULT_SKIN, 0, Ctx(now=datetime.now()), {})
        self.board_error: str | None = None
        self._state: dict[str, Any] = {}
        self._ctx = Ctx(now=datetime.now())
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        with Session(engine) as session:
            if row := latest_equip(session):
                user = session.get(User, row.user_id)
                self.equip(row.skin, user)
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name="led-display", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def equip(self, skin: str, user: User | None) -> None:
        with self._lock:
            self.skin = skin if skin in SKINS else DEFAULT_SKIN
            self.owner_id = user.id if user else None
            self.owner_name = (user.display_name or user.username) if user else None
            self._state = {}

    def _run(self) -> None:
        start = time.monotonic()
        ctx_at = board_at = pushed_at = 0.0
        board_present = False
        while not self._stop.is_set():
            now = time.monotonic()
            with self._lock:
                skin, owner_id, state = self.skin, self.owner_id, self._state

            if now - ctx_at > CTX_REFRESH_SECONDS:
                ctx_at = now
                try:
                    with Session(engine) as session:
                        self._ctx = context_for(session, session.get(User, owner_id) if owner_id else None)
                except Exception:
                    pass
            self._ctx.now = datetime.now()

            try:
                frame = render(skin, now - start, self._ctx, state)
            except Exception:
                frame = self.frame
            self.frame = frame

            if now - board_at > BOARD_CHECK_SECONDS:
                board_at = now
                try:
                    board_present = unicorn.status()["connected"] is True
                except Exception:
                    board_present = False
            min_gap = 0 if unicorn.fast else 1 / SLOW_BOARD_FPS
            if board_present and now - pushed_at >= min_gap:
                pushed_at = now
                try:
                    unicorn.show_frame(frame)
                    self.board_error = None
                except UnicornError as e:
                    self.board_error = str(e)
                    board_at = now + 5  # back off before trying again
                    board_present = False
                except Exception as e:  # pyserial missing etc.
                    self.board_error = str(e)
                    board_present = False

            self._stop.wait(1 / SKINS[skin].fps if skin in SKINS else 0.5)


display = LedDisplay()


# ---- API ---------------------------------------------------------------------

class EquipIn(BaseModel):
    skin: str


def _board() -> dict[str, object]:
    try:
        s = unicorn.status()
    except Exception:
        s = {"connected": False, "port": None}
    return {**s, "fast": unicorn.fast, "error": display.board_error}


@router.get("/state")
def state(_: CurrentUser) -> dict[str, object]:
    return {
        "skin": display.skin,
        "skin_name": SKINS[display.skin].name,
        "owner_name": display.owner_name,
        "frame": to_hex(display.frame),
        "board": _board(),
    }


_preview_state: dict[str, dict[str, Any]] = {}
_preview_start = time.monotonic()


@router.get("/wardrobe")
def wardrobe(user: CurrentUser, session: SessionDep) -> list[dict[str, object]]:
    """Every skin with a live preview frame, whether this user owns it, and how to buy it."""
    owned = owned_skins(session, user)
    ctx = context_for(session, user)
    t = time.monotonic() - _preview_start
    owner = user.id if user.role == "parent" else user.parent_id
    if owner is not None:
        ensure_skin_rewards(session, owner)
    shop_items = {
        link.skin: link.reward_id
        for link, reward in session.exec(
            select(RewardSkin, Reward)
            .join(Reward, col(Reward.id) == col(RewardSkin.reward_id))
            .where(Reward.parent_id == owner, col(Reward.active))
        ).all()
    }
    out = []
    for s in SKINS.values():
        frame = render(s.key, t, ctx, _preview_state.setdefault(s.key, {}))
        out.append(
            {
                "key": s.key,
                "name": s.name,
                "description": s.description,
                "price": s.price,
                "owned": s.key in owned,
                "showing": s.key == display.skin,
                "reward_id": shop_items.get(s.key),
                "preview": to_hex(frame),
            }
        )
    return out


@router.post("/equip")
def equip(body: EquipIn, user: CurrentUser, session: SessionDep) -> dict[str, object]:
    if body.skin not in SKINS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such skin")
    if body.skin not in owned_skins(session, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Buy this skin in the shop first")
    assert user.id is not None
    set_equip(session, user.id, body.skin)
    display.equip(body.skin, user)
    return state(user)

