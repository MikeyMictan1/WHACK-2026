"""The site's internal clock.

It starts at the moment it was created and runs along with real time. The admin can push it
forward by days or calendar months; reset removes those pushes, giving the value it would have had
if nobody had touched it.

The whole site uses `site_now()` instead of `datetime.now()`. The exceptions are security clocks
(login token expiry, the NFC card save stamp), which stay on real time.
"""

import calendar
from datetime import UTC, datetime, timedelta

from sqlmodel import Field, Session, SQLModel

CLOCK_ID = 1  # single row

# ---- Table -----------------------------------------------------------------


class SiteClock(SQLModel, table=True):
    __tablename__ = "site_clock"  # type: ignore[assignment]

    id: int = Field(default=CLOCK_ID, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    offset_months: int = 0  # added by the admin
    offset_days: int = 0  # added by the admin (a week is 7 days)


# ---- Schemas ---------------------------------------------------------------


class ClockOut(SQLModel):
    now: datetime  # the site's current time (real time + admin offset)
    natural: datetime  # what it would be if never altered (real time)
    created_at: datetime
    offset_months: int
    offset_days: int


# ---- Logic -----------------------------------------------------------------


def _utc(dt: datetime) -> datetime:
    """SQLite hands datetimes back without a timezone; they're stored as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def add_months(dt: datetime, months: int) -> datetime:
    """Calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb)."""
    index = dt.month - 1 + months
    year, month = dt.year + index // 12, index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def get_clock(session: Session) -> SiteClock:
    """The clock row, created (starting now) the first time it's needed."""
    clock = session.get(SiteClock, CLOCK_ID)
    if clock is None:
        clock = SiteClock()
        session.add(clock)
        session.commit()
        session.refresh(clock)
    return clock


def _shift(real: datetime, clock: SiteClock) -> datetime:
    return add_months(real, clock.offset_months) + timedelta(days=clock.offset_days)


def site_now(session: Session | None = None) -> datetime:
    """The site's current time (UTC): the real time plus whatever the admin added. Every timestamp
    and date rule on the site uses this instead of `datetime.now()`. It keeps the real time of day
    so ordering and short timers (request expiry) still work."""
    if session is None:
        from app.core.database import engine

        with Session(engine) as s:
            return _shift(datetime.now(UTC), get_clock(s))
    return _shift(datetime.now(UTC), get_clock(session))


def site_offset(session: Session | None = None) -> timedelta:
    """How far the site clock is ahead of real time."""
    return site_now(session) - datetime.now(UTC)


def clock_out(clock: SiteClock) -> ClockOut:
    real = datetime.now(UTC)
    return ClockOut(
        now=_shift(real, clock),
        natural=real,
        created_at=_utc(clock.created_at),
        offset_months=clock.offset_months,
        offset_days=clock.offset_days,
    )


def advance_clock(session: Session, *, days: int = 0, months: int = 0) -> SiteClock:
    clock = get_clock(session)
    clock.offset_days += days
    clock.offset_months += months
    session.add(clock)
    session.commit()
    session.refresh(clock)
    return clock


def reset_clock(session: Session) -> SiteClock:
    clock = get_clock(session)
    clock.offset_days = 0
    clock.offset_months = 0
    session.add(clock)
    session.commit()
    session.refresh(clock)
    return clock
