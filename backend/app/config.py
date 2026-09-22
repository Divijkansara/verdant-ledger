"""Application settings, loaded from environment variables.

Everything that differs between a laptop, the lab machine and a deployment
lives here — nothing else in the codebase reads os.environ directly.
"""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- application -------------------------------------------------------
    app_name: str = "Terrawise API"
    app_version: str = "1.0.0"
    debug: bool = True

    # --- database ----------------------------------------------------------
    # SQLite by default so the project runs with zero setup.
    # Switch to PostgreSQL by exporting:
    #   DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/verdant
    database_url: str = "sqlite:///./verdant_ledger.db"

    # --- security ----------------------------------------------------------
    secret_key: str = "change-me-in-production-this-is-a-dev-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12  # 12 hours

    # --- CORS --------------------------------------------------------------
    # The React dev server (Vite = 5173, CRA = 3000) and a plain file:// page.
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5500,http://localhost:5500"

    # --- domain defaults ---------------------------------------------------
    default_page_size: int = 50
    max_page_size: int = 500

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        # A browser sends its Origin without a trailing slash, so a pasted
        # "https://site.vercel.app/" would otherwise never match.
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is parsed once per process."""
    return Settings()


settings = get_settings()

# On a deployment (Vercel sets VERCEL=1) the public dev key would let anyone
# forge a login token. The app still imports (so Vercel can start it) but
# answers every request with this message until SECRET_KEY is set.
SERVERLESS = bool(os.environ.get("VERCEL"))
STARTUP_PROBLEM = (
    "SECRET_KEY is not set. Add a SECRET_KEY environment variable in the Vercel "
    "project settings (any long random string) and redeploy."
    if SERVERLESS and settings.secret_key.startswith("change-me") else None
)
