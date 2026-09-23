"""FastAPI application entry point.

Run it with:
    uvicorn app.main:app --reload

Interactive API documentation is generated automatically from the route
signatures and Pydantic schemas:
    http://127.0.0.1:8000/docs    (Swagger UI — good for the demo)
    http://127.0.0.1:8000/redoc
"""

import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app.config import SERVERLESS, STARTUP_PROBLEM, settings
from sqlalchemy import text

from app.database import SessionLocal, engine, init_db, scrub
from app.routers import auth, dashboard, dashboards, entries, events, factors, reports

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("verdant")

DESCRIPTION = """
A digital sustainability ledger for an organisation.

Activities across eight categories — electricity, water, waste, transport,
paper, procurement, recycling and renewable energy — are posted as ledger
entries, priced against published emission factors, and rolled up into a
carbon footprint, resource-consumption totals and a weighted sustainability
score.

**Accounting rules enforced by this API**

* Every entry stores the factor value it was priced with, so revising a
  factor never silently restates a past report.
* Entries are append-only. Corrections are made by voiding and reposting;
  there is no DELETE on the ledger.
* Every state change is written to an audit log.
"""

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup: make sure the schema exists. Shutdown: nothing to unwind."""
    # Never log the URL itself: it carries the database password.
    try:
        init_db()
        logger.info("Database ready (%s)", engine.dialect.name)
    except Exception:  # noqa: BLE001 — /api/health reports it; keep serving
        logger.exception("Database not reachable at startup")
    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    version=settings.app_version,
    description=DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Time every request and expose the duration in a response header."""
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"
    logger.info("%s %s -> %s in %.1fms", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


_setup_lock = threading.Lock()
_setup_done = False


def _serverless_setup() -> None:
    """Once per serverless instance: create missing tables, then load the
    factors and demo organisation if a fresh database lacks them. Runs on the
    first request because serverless hosts do not reliably run startup
    events. Failures are logged and shown by /api/health, never fatal."""
    global _setup_done
    with _setup_lock:
        if _setup_done:
            return
        _setup_done = True
        try:
            from app.seed import seed_demo_org, seed_factors

            init_db()
            with SessionLocal() as db:
                seed_demo_org(db, seed_factors(db))
        except Exception:  # noqa: BLE001
            logger.exception("Database setup skipped")


@app.middleware("http")
async def serverless_guard(request: Request, call_next):
    if STARTUP_PROBLEM:
        return JSONResponse(status_code=503, content={"status": "misconfigured", "reason": STARTUP_PROBLEM})
    if SERVERLESS and not _setup_done:
        await run_in_threadpool(_serverless_setup)
    return await call_next(request)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Domain errors raised by the services become clean 422s instead of 500s."""
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Liveness plus a real database round trip, so a deployment shows at a
    glance whether it can reach its database and, if not, why."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:  # noqa: BLE001
        database = scrub(f"{type(exc).__name__}: {getattr(exc, 'orig', exc)}")[:400]
    body = {"status": "ok", "service": settings.app_name, "version": settings.app_version,
            "database": database}
    if database != "ok":
        # Which server the URL points at, never the password: most failures
        # are a mangled copy-paste, and this shows where it went wrong.
        try:
            u = engine.url
            body["connecting_to"] = {"host": repr(u.host), "port": u.port,
                                     "user": u.username, "database": u.database}
        except Exception:  # noqa: BLE001
            pass
    return body


app.include_router(auth.router)
app.include_router(factors.router)
app.include_router(entries.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(events.router)
app.include_router(dashboards.router)
