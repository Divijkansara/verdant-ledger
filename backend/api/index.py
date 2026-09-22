"""Vercel entry point: exposes the FastAPI app as a serverless function."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402,F401

# Serverless platforms do not always run ASGI startup events, so create any
# missing tables here, once per cold start. It is a no-op when they exist.
init_db()
