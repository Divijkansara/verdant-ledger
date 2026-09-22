"""Vercel entry point: exposes the FastAPI app as a serverless function.

If startup fails (a missing environment variable, an unreachable database)
the function still answers, with the reason, instead of Vercel's opaque
500 FUNCTION_INVOCATION_FAILED page.
"""
import logging
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
log = logging.getLogger("verdant")

try:
    from app.database import SessionLocal, init_db
    from app.main import app
    from app.seed import seed_demo_org, seed_factors
except Exception as exc:  # noqa: BLE001
    traceback.print_exc()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    reason = f"{type(exc).__name__}: {exc}"
    try:
        from app.database import scrub
        reason = scrub(reason)
    except Exception:  # noqa: BLE001
        pass
    app = FastAPI()

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    def startup_failed(path: str):
        return JSONResponse(status_code=503, content={"status": "startup failed", "reason": reason[:600]})
else:
    # Serverless platforms do not always run ASGI startup events, so create
    # missing tables here, once per cold start (a no-op when they exist), then
    # load the factors and demo organisation if a fresh database lacks them.
    # Failures are logged and shown by /api/health; the API keeps serving.
    try:
        init_db()
        with SessionLocal() as db:
            seed_demo_org(db, seed_factors(db))
    except Exception:  # noqa: BLE001
        log.exception("Database setup skipped")
