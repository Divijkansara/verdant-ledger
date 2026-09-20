"""Password hashing, JWT issue/verify, and the auth dependencies.

Passwords are stored as bcrypt hashes — never plaintext, never a
reversible cipher. The token carries only the user id, the org id and the
role; everything else is looked up server-side so a stolen token cannot be
edited into more privilege than it was issued with.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Role, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def create_access_token(user: User) -> tuple[str, int]:
    """Return (token, seconds_until_expiry)."""
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": str(user.id),
        "org": user.org_id,
        "role": user.role.value,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, int(expires_delta.total_seconds())


CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise CREDENTIALS_ERROR
    try:
        payload = jwt.decode(creds.credentials, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise CREDENTIALS_ERROR

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR
    return user


def require_role(*allowed: Role):
    """Dependency factory: require_role(Role.ADMIN) guards admin-only routes."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of: {', '.join(r.value for r in allowed)}",
            )
        return user

    return dependency


# Convenience aliases used by the routers
require_admin = require_role(Role.ADMIN)
require_writer = require_role(Role.ADMIN, Role.CONTRIBUTOR)
