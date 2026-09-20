"""Database engine, session factory and the FastAPI dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# check_same_thread is a SQLite-only quirk: FastAPI serves requests from a
# thread pool, and SQLite refuses cross-thread connections without it.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

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
