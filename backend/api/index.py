"""Vercel entry point: exposes the FastAPI app as a serverless function."""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402,F401
from app.seed import seed_demo_org, seed_factors  # noqa: E402

# Serverless platforms do not always run ASGI startup events, so create any
# missing tables here, once per cold start. It is a no-op when they exist.
init_db()

# Load the emission factors and the demo organisation the first time the
# API starts against an empty database, so a fresh Supabase project needs no
# manual seeding. Both steps skip rows that already exist. A failure here is
# logged, never fatal: the API still serves.
try:
    with SessionLocal() as db:
        seed_demo_org(db, seed_factors(db))
except Exception:  # noqa: BLE001
    logging.getLogger("verdant").exception("Demo seed skipped")
