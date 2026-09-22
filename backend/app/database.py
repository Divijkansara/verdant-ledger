"""Database engine, session factory and the FastAPI dependency."""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

def normalize_url(url: str) -> str:
    """Accept the connection string exactly as Supabase (or any Postgres host)
    prints it. 'postgres://' and 'postgresql://' are rewritten to use the
    psycopg 3 driver, which is the one in requirements.txt."""
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def make_engine(url: str):
    url = normalize_url(url)
    if url.startswith("sqlite"):
        # FastAPI serves requests from a thread pool, and SQLite refuses
        # cross-thread connections without this.
        return create_engine(url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

    connect_args = {
        # Supabase's pooler (port 6543) runs PgBouncer in transaction mode,
        # which cannot keep server-side prepared statements between queries.
        "prepare_threshold": None,
        "connect_timeout": 10,
    }
    if "sslmode=" not in url and "localhost" not in url and "127.0.0.1" not in url:
        connect_args["sslmode"] = "require"  # Supabase only accepts TLS
    # A serverless function (Vercel) is frozen between requests, so a pool
    # would hold dead connections; the external pooler does the pooling.
    serverless = bool(os.environ.get("VERCEL"))
    return create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,
        **({"poolclass": NullPool} if serverless else {"pool_size": 5, "max_overflow": 5, "pool_recycle": 300}),
    )


engine = make_engine(settings.database_url)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def get_db() -> Generator[Session, None, None]:
    """Request-scoped session. Injected with Depends(get_db).

    One session per request, closed in a finally block so a failed request
    never leaks a connection back into the pool.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables that do not exist yet.

    Fine for a course project. A production system would use Alembic
    migrations instead — see docs/api.md, 'Migrations'.
    """
    from app import models  # noqa: F401  (import registers the mappers)

    Base.metadata.create_all(bind=engine)

    # Supabase publishes every table in the public schema through its REST
    # API unless row-level security is on. Enabling it with no policies
    # closes that door; this backend connects as the tables' owner, which
    # RLS does not restrict, so the API keeps working. Harmless elsewhere.
    if engine.dialect.name == "postgresql":
        from sqlalchemy import text

        with engine.begin() as conn:
            for table in Base.metadata.sorted_tables:
                conn.execute(text(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY'))
