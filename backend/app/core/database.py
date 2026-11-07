import logging
from collections.abc import Generator
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import Column, DateTime, inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, connect_args=_connect_args)
log = logging.getLogger("uvicorn.error")


def init_db() -> None:
    """Create tables for every registered model, and add columns that existing tables are missing."""
    import app.models  # noqa: F401  (registers tables on SQLModel.metadata)

    from app.models.clock import get_clock
    from app.models.user import ensure_admin

    _migrate_email_to_username()
    SQLModel.metadata.create_all(engine)  # new tables only; never touches existing ones
    _add_missing_columns()  # before anything reads the tables (ensure_admin queries user)
    with Session(engine) as session:
        ensure_admin(session, settings.admin_username, settings.admin_password)
        get_clock(session)  # starts the site clock the first time the app runs


# ---- Adding columns to existing tables --------------------------------------------------
# create_all never adds columns to a table that already exists, so a teammate adding a field to a model
# used to break everyone's local database. This covers the common case (a new column) automatically.
# It cannot handle renames, deletes or type changes; for those, delete backend/app.db (or run
# `npm run seed:reset`). Problems it can't fix are logged as warnings at startup instead of surfacing as 500s.

def _literal(value: Any) -> str:
    """A Python value as an SQL literal for a DEFAULT clause."""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        return f"'{value:%Y-%m-%d %H:%M:%S.%f}'"
    return "'" + str(value).replace("'", "''") + "'"


def _column_ddl(table_name: str, col: Column[Any]) -> str | None:
    """The `name TYPE ...` text for ALTER TABLE ADD COLUMN, or None if this column cannot be added."""
    quote = engine.dialect.identifier_preparer.quote
    ddl = f"{quote(col.name)} {col.type.compile(dialect=engine.dialect)}"
    if col.primary_key:
        return None
    if col.nullable:
        return ddl
    default = col.default
    if default is not None and default.is_scalar:  # type: ignore[attr-defined]
        return f"{ddl} NOT NULL DEFAULT {_literal(default.arg)}"  # type: ignore[attr-defined]
    if isinstance(col.type, DateTime):  # a default_factory like "now": existing rows get the time of the upgrade
        return f"{ddl} NOT NULL DEFAULT {_literal(datetime.now(UTC))}"
    # Required column with no usable default (SQLite cannot add one): add it as optional so queries work.
    log.warning(
        "Added %s.%s as optional because it has no default; existing rows have no value for it. "
        "If you see errors, delete backend/app.db.",
        table_name,
        col.name,
    )
    return ddl


def _add_missing_columns() -> None:
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    quote = engine.dialect.identifier_preparer.quote

    for table in SQLModel.metadata.sorted_tables:
        if table.name not in existing:
            continue
        live = {c["name"]: c for c in insp.get_columns(table.name)}
        added: set[str] = set()

        for col in table.columns:
            if col.name in live:
                continue
            ddl = _column_ddl(table.name, col)
            if ddl is None:
                log.warning("Cannot add %s.%s automatically. Delete backend/app.db to rebuild the tables.", table.name, col.name)
                continue
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {quote(table.name)} ADD COLUMN {ddl}"))
            added.add(col.name)
            log.info("Added missing column %s.%s", table.name, col.name)

        # A required column that no model uses any more makes every insert fail.
        for name, info in live.items():
            if name not in table.columns and not info.get("nullable", True) and info.get("default") is None:
                log.warning(
                    "Table %s has a required column %s that the code no longer uses, so inserts will fail. "
                    "Delete backend/app.db to rebuild the tables.",
                    table.name,
                    name,
                )

        # Indexes only get created with a new table, so create the ones for columns we just added.
        for index in table.indexes:
            if added & {c.name for c in index.columns}:
                try:
                    index.create(engine, checkfirst=True)
                except Exception as e:  # noqa: BLE001  (never block startup over an index)
                    log.warning("Could not create index %s: %s", index.name, e)


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
