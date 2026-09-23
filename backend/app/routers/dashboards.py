"""Dashboards: one per organisation or site, synced across devices and
shared with colleagues.

The browser owns the engine, so a dashboard travels as one JSON payload
and the server decides only two things: where it lives, and who may see
or change it. Everything here therefore reduces to an access check —
owner, editor, viewer — applied before the payload is read or written.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Dashboard, DashboardMember, DashboardRole, User
from app.security import get_current_user

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


# ───────────────────────────── shapes ────────────────────────────────

class DashboardIn(BaseModel):
    id: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    sector: str = Field("", max_length=80)
    sample: bool = False
    payload: dict


class DashboardPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    sector: str | None = Field(None, max_length=80)
    payload: dict | None = None


class ShareIn(BaseModel):
    email: EmailStr
    role: DashboardRole = DashboardRole.VIEWER


# ──────────────────────────── access ─────────────────────────────────

def _role_of(dash: Dashboard, user: User) -> str | None:
    """'owner', 'editor', 'viewer', or None when it is not theirs at all."""
    if dash.owner_id == user.id:
        return "owner"
    for m in dash.members:
        if m.user_id == user.id:
            return m.role.value
    return None


def _get(db: Session, dash_id: str, user: User, *, need: str = "viewer") -> tuple[Dashboard, str]:
    dash = db.get(Dashboard, dash_id)
    if not dash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such dashboard")
    role = _role_of(dash, user)
    # A dashboard someone cannot see should not announce that it exists.
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such dashboard")
    rank = {"viewer": 0, "editor": 1, "owner": 2}
    if rank[role] < rank[need]:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"This dashboard is shared with you as a {role}")
    return dash, role


def _out(dash: Dashboard, role: str, *, payload: bool = True) -> dict:
    body = {
        "id": dash.id, "name": dash.name, "sector": dash.sector, "sample": dash.sample,
        "role": role, "owner": dash.owner.name if dash.owner else "",
        "owner_email": dash.owner.email if dash.owner else "",
        "updated_at": dash.updated_at.isoformat() if dash.updated_at else None,
        "shared_with": len(dash.members),
    }
    if payload:
        body["payload"] = dash.payload
    return body


# ──────────────────────────── routes ─────────────────────────────────

@router.get("")
def list_dashboards(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Everything this user may open, theirs first.

    The payload rides along: the cards show a grade and a footprint, and
    those come from the engine in the browser, not from here.
    """
    owned = db.scalars(select(Dashboard).where(Dashboard.owner_id == user.id)).all()
    shared = db.scalars(
        select(Dashboard).join(DashboardMember).where(DashboardMember.user_id == user.id)
    ).all()
    rows = [_out(d, "owner") for d in owned]
    rows += [_out(d, _role_of(d, user) or "viewer") for d in shared]
    return {"dashboards": rows}


@router.post("", status_code=201)
def create_dashboard(body: DashboardIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> dict:
    existing = db.get(Dashboard, body.id)
    if existing:
        # The client generates ids; a repeat means the same dashboard from
        # another device, so treat it as the update it really is.
        if existing.owner_id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "That id is already taken")
        existing.name, existing.sector, existing.payload = body.name, body.sector, body.payload
        db.commit()
        return _out(existing, "owner")

    dash = Dashboard(id=body.id, owner_id=user.id, name=body.name, sector=body.sector,
                     sample=body.sample, payload=body.payload)
    db.add(dash)
    db.commit()
    db.refresh(dash)
    return _out(dash, "owner")


@router.get("/{dash_id}")
def read_dashboard(dash_id: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)) -> dict:
    dash, role = _get(db, dash_id, user)
    return _out(dash, role)


@router.put("/{dash_id}")
def update_dashboard(dash_id: str, body: DashboardPatch, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> dict:
    dash, role = _get(db, dash_id, user, need="editor")
    if body.name is not None:
        dash.name = body.name
    if body.sector is not None:
        dash.sector = body.sector
    if body.payload is not None:
        dash.payload = body.payload
    dash.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _out(dash, role, payload=False)


@router.delete("/{dash_id}", status_code=204)
def delete_dashboard(dash_id: str, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)) -> None:
    dash, _ = _get(db, dash_id, user, need="owner")
    db.delete(dash)
    db.commit()


# ──────────────────────────── sharing ────────────────────────────────

@router.get("/{dash_id}/members")
def list_members(dash_id: str, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> dict:
    dash, role = _get(db, dash_id, user)
    return {"role": role, "owner": {"name": dash.owner.name, "email": dash.owner.email},
            "members": [{"user_id": m.user_id, "name": m.user.name, "email": m.user.email,
                         "role": m.role.value} for m in dash.members]}


@router.post("/{dash_id}/share", status_code=201)
def share_dashboard(dash_id: str, body: ShareIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> dict:
    dash, _ = _get(db, dash_id, user, need="owner")
    email = body.email.lower()
    mate = db.scalar(select(User).where(User.email == email))
    if not mate:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            "Nobody with that email has an account yet. Ask them to sign up first.")
    if mate.id == dash.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already own this dashboard")

    existing = db.scalar(select(DashboardMember).where(
        DashboardMember.dashboard_id == dash.id, DashboardMember.user_id == mate.id))
    if existing:
        existing.role = body.role                      # a re-share changes the role
    else:
        db.add(DashboardMember(dashboard_id=dash.id, user_id=mate.id, role=body.role))
    db.commit()
    return {"shared_with": mate.email, "name": mate.name, "role": body.role.value}


@router.delete("/{dash_id}/members/{user_id}", status_code=204)
def unshare_dashboard(dash_id: str, user_id: int, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)) -> None:
    # The owner can remove anyone; anyone can remove themselves.
    dash, role = _get(db, dash_id, user, need="owner" if user_id != user.id else "viewer")
    member = db.scalar(select(DashboardMember).where(
        DashboardMember.dashboard_id == dash.id, DashboardMember.user_id == user_id))
    if member:
        db.delete(member)
        db.commit()
