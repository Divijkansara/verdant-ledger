"""Site activity log.

The website batches what visitors do and posts it here. Writing is open
(visitors are anonymous) but bounded: at most 50 events per call and small
payloads. Reading is admin-only.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SiteEvent, User
from app.security import require_admin

router = APIRouter(prefix="/api/events", tags=["site activity"])


class EventIn(BaseModel):
    kind: str = Field(max_length=40)
    path: str = Field("", max_length=200)
    detail: dict | None = None


class EventBatch(BaseModel):
    session_id: str = Field(min_length=4, max_length=40)
    events: list[EventIn] = Field(max_length=50)


@router.post("", status_code=202)
def record(batch: EventBatch, db: Session = Depends(get_db)) -> dict:
    for e in batch.events:
        detail = e.detail if e.detail and len(str(e.detail)) <= 2000 else None
        db.add(SiteEvent(session_id=batch.session_id, kind=e.kind, path=e.path, detail=detail))
    db.commit()
    return {"stored": len(batch.events)}


@router.get("")
def recent(
    limit: int = Query(100, le=500),
    kind: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    q = select(SiteEvent).order_by(SiteEvent.id.desc()).limit(limit)
    if kind:
        q = q.where(SiteEvent.kind == kind)
    rows = db.scalars(q).all()
    counts = dict(db.execute(select(SiteEvent.kind, func.count()).group_by(SiteEvent.kind)).all())
    return {
        "counts": counts,
        "events": [
            {"id": r.id, "session": r.session_id, "kind": r.kind, "path": r.path,
             "detail": r.detail, "at": r.created_at.isoformat()}
            for r in rows
        ],
    }
