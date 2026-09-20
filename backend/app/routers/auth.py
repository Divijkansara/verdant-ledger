"""Registration, login and the current-user endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, Organization, Role, User
from app.schemas import (
    LoginRequest,
    OrganizationOut,
    OrganizationUpdate,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.security import create_access_token, get_current_user, hash_password, require_admin, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Create an organisation and its first user (who becomes the admin)."""
    existing = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists")

    org = Organization(name=payload.org_name, headcount=payload.headcount, sector=payload.sector)
    db.add(org)
    db.flush()  # assigns org.id without committing

    user = User(
        org_id=org.id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=Role.ADMIN,
    )
    db.add(user)
    db.add(AuditLog(org_id=org.id, user_id=None, action="org.create", entity="organization",
                    entity_id=org.id, detail={"name": org.name}))
    db.commit()
    db.refresh(user)

    token, expires_in = create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    # Same message for "no such user" and "wrong password" — revealing which
    # one failed would let an attacker enumerate valid email addresses.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")

    token, expires_in = create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.get("/organization", response_model=OrganizationOut)
def get_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return OrganizationOut.model_validate(db.get(Organization, user.org_id))


@router.patch("/organization", response_model=OrganizationOut)
def update_organization(
    payload: OrganizationUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Headcount matters: every intensity metric divides by it."""
    org = db.get(Organization, user.org_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    db.add(AuditLog(org_id=org.id, user_id=user.id, action="org.update", entity="organization",
                    entity_id=org.id, detail=payload.model_dump(exclude_unset=True)))
    db.commit()
    db.refresh(org)
    return OrganizationOut.model_validate(org)
