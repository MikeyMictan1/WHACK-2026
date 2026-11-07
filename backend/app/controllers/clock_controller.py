"""The site's internal clock: anyone can read it; only the admin can move or reset it."""

from typing import Literal

from fastapi import APIRouter
from sqlmodel import SQLModel

from app.controllers.deps import CurrentAdmin
from app.core.database import SessionDep
from app.models.clock import ClockOut, advance_clock, clock_out, get_clock, reset_clock

router = APIRouter(prefix="/clock", tags=["clock"])


class AdvanceIn(SQLModel):
    unit: Literal["day", "week", "month"]


@router.get("", response_model=ClockOut)
def read_clock(session: SessionDep) -> ClockOut:
    return clock_out(get_clock(session))


@router.post("/advance", response_model=ClockOut)
def advance(data: AdvanceIn, _: CurrentAdmin, session: SessionDep) -> ClockOut:
    if data.unit == "month":
        clock = advance_clock(session, months=1)
    else:
        clock = advance_clock(session, days=7 if data.unit == "week" else 1)
    return clock_out(clock)


@router.post("/reset", response_model=ClockOut)
def reset(_: CurrentAdmin, session: SessionDep) -> ClockOut:
    return clock_out(reset_clock(session))
