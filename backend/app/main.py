"""FastAPI application entry point.

Run it with:
    uvicorn app.main:app --reload

Interactive API documentation is generated automatically from the route
signatures and Pydantic schemas:
    http://127.0.0.1:8000/docs    (Swagger UI — good for the demo)
    http://127.0.0.1:8000/redoc
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.routers import auth, dashboard, entries, events, factors, reports

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
    init_db()
    logger.info("Database ready at %s", settings.database_url)
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


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Domain errors raised by the services become clean 422s instead of 500s."""
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


app.include_router(auth.router)
app.include_router(factors.router)
app.include_router(entries.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(events.router)
