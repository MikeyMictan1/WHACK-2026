from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, connect_args=_connect_args)


def init_db() -> None:
    """Create tables for every registered model."""
    import app.models  # noqa: F401  (registers tables on SQLModel.metadata)

    _migrate_email_to_username()
    SQLModel.metadata.create_all(engine)


def _migrate_email_to_username() -> None:
    """One-off: older databases logged in by email. Rebuild `user` with a username
    (taken from the part of the email before the @) and drop email/name."""
    insp = inspect(engine)
    if "user" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("user")}
    if "username" in columns or "email" not in columns:
        return

    with engine.begin() as conn:
        rows = conn.execute(text('SELECT id, email, hashed_password, created_at FROM "user"')).all()
        conn.execute(text('ALTER TABLE "user" RENAME TO user_old'))
        conn.execute(text("DROP INDEX IF EXISTS ix_user_email"))
        SQLModel.metadata.tables["user"].create(conn)
        taken: set[str] = set()
        for id_, email, hashed, created in rows:
            base = "".join(ch for ch in email.split("@")[0].lower() if ch.isalnum() or ch in "_.-")[:28] or "user"
            name, n = base, 1
            while name in taken or len(name) < 3:
                n += 1
                name = f"{base}{n}"
            taken.add(name)
            conn.execute(
                text('INSERT INTO "user" (id, username, hashed_password, created_at) VALUES (:i, :u, :h, :c)'),
                {"i": id_, "u": name, "h": hashed, "c": created},
            )
        conn.execute(text("DROP TABLE user_old"))


def get_session() -> Generator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
