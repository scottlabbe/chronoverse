import os
import logging
try:
    # Ensure local .env is loaded for dev runs (Alembic already does this)
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:
    # dotenv is optional; if not present, proceed with raw environment
    pass
from sqlalchemy import create_engine, event

DB_ECHO = os.getenv("DB_ECHO") == "1"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/events.db")


def _ensure_dir_for_sqlite(url: str) -> None:
    if not url.startswith("sqlite///") and not url.startswith("sqlite:///"):
        return
    path = url.replace("sqlite:///", "", 1)
    if path == ":memory:":
        return
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)


def _build_engine():
    if DATABASE_URL.startswith("sqlite:"):
        _ensure_dir_for_sqlite(DATABASE_URL)
        eng = create_engine(
            DATABASE_URL,
            future=True,
            pool_pre_ping=True,
            connect_args={"check_same_thread": False},
            echo=DB_ECHO,
        )

        @event.listens_for(eng, "connect")
        def _sqlite_pragmas(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            try:
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.execute("PRAGMA busy_timeout=5000")
            finally:
                cur.close()

        return eng

    # Postgres / others
    pool_size = int(os.getenv("DB_POOL_SIZE", "5"))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    pool_recycle = int(os.getenv("DB_POOL_RECYCLE_S", "300"))
    return create_engine(
        DATABASE_URL,
        future=True,
        pool_pre_ping=True,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_recycle=pool_recycle,
        echo=DB_ECHO,
    )


engine = _build_engine()


def dialect() -> str:
    return engine.dialect.name


def is_sqlite() -> bool:
    return engine.dialect.name == "sqlite"


def is_postgres() -> bool:
    return engine.dialect.name == "postgresql"


# Optional one-line startup log (non-fatal if logging not configured)
try:
    logging.getLogger(__name__).info(
        "DB engine ready", extra={"dialect": dialect(), "url": str(engine.url)}
    )
except Exception:
    pass
