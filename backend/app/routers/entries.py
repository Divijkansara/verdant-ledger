"""Ledger entries — the write side of the application.

The route set is deliberately not a plain CRUD:

    POST   /api/entries            post an entry
    POST   /api/entries/preview    price an activity without saving it
    GET    /api/entries            filter + paginate
    GET    /api/entries/{id}       one entry
    PATCH  /api/entries/{id}       edit the reference text only
    POST   /api/entries/{id}/void  reverse an entry, with a reason

There is no DELETE. A ledger you can quietly delete from is not a ledger.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import AuditLog, Category, EmissionFactor, EntryStatus, LedgerEntry, User
from app.schemas import (
    EntryCreate,
    EntryOut,
    EntryPage,
    EntryPreview,
    EntryUpdate,
    EntryVoid,
    Page,
)
from app.security import get_current_user, require_writer
from app.services.calculator import price_activity

router = APIRouter(prefix="/api/entries", tags=["ledger"])


def _load_factor(db: Session, factor_id: int) -> EmissionFactor:
    factor = db.get(EmissionFactor, factor_id)
    if factor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emission factor not found")
    if not factor.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That emission factor has been retired")
    return factor


@router.post("/preview", response_model=EntryPreview)
def preview(payload: EntryCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Price an activity without committing it.

    This is what lets the 'Log activity' screen show the computed impact
    live as the user types, using exactly the same engine that will price
    the entry when they submit — the UI can never disagree with the ledger.
    """
    factor = _load_factor(db, payload.factor_id)
    priced = price_activity(factor, payload.quantity)
    return EntryPreview(
        factor_id=factor.id,
        label=factor.label,
        quantity=payload.quantity,
        unit=priced.unit,
        factor_value=priced.factor_value,
        co2e_kg=priced.co2e_kg,
        scope=priced.scope,
        is_credit=priced.is_credit,
    )


@router.post("", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, user: User = Depends(require_writer), db: Session = Depends(get_db)):
    factor = _load_factor(db, payload.factor_id)
    try:
        priced = price_activity(factor, payload.quantity)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    entry = LedgerEntry(
        org_id=user.org_id,
        factor_id=factor.id,
        created_by_id=user.id,
        activity_date=payload.activity_date,
        quantity=payload.quantity,
        reference=payload.reference,
        factor_value_snapshot=priced.factor_value,
        unit_snapshot=priced.unit,
        scope_snapshot=priced.scope,
        co2e_kg=priced.co2e_kg,
    )
    db.add(entry)
    db.flush()
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="entry.create", entity="ledger_entry",
                    entity_id=entry.id, detail={"co2e_kg": priced.co2e_kg, "factor": factor.activity_code}))
    db.commit()

    entry = db.execute(
        select(LedgerEntry).options(joinedload(LedgerEntry.factor)).where(LedgerEntry.id == entry.id)
    ).scalar_one()
    return EntryOut.from_entry(entry)


@router.get("", response_model=EntryPage)
def list_entries(
    category: Category | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    scope: int | None = Query(None, ge=1, le=3),
    status_filter: EntryStatus | None = Query(None, alias="status"),
    q: str | None = Query(None, description="Search the activity label and reference"),
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.default_page_size, ge=1, le=settings.max_page_size),
    sort: str = Query("-activity_date", pattern=r"^-?(activity_date|co2e_kg|created_at)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(LedgerEntry)
        .join(EmissionFactor, LedgerEntry.factor_id == EmissionFactor.id)
        .options(joinedload(LedgerEntry.factor))
        .where(LedgerEntry.org_id == user.org_id)
    )
    if category:
        stmt = stmt.where(EmissionFactor.category == category)
    if date_from:
        stmt = stmt.where(LedgerEntry.activity_date >= date_from)
    if date_to:
        stmt = stmt.where(LedgerEntry.activity_date <= date_to)
    if scope:
        stmt = stmt.where(LedgerEntry.scope_snapshot == scope)
    if status_filter:
        stmt = stmt.where(LedgerEntry.status == status_filter)
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(EmissionFactor.label).like(needle), func.lower(LedgerEntry.reference).like(needle))
        )

    # Totals over the whole filtered set, not just the page on screen.
    totals_stmt = stmt.with_only_columns(
        func.coalesce(func.sum(LedgerEntry.co2e_kg), 0.0),
        func.count(LedgerEntry.id),
    ).order_by(None)
    net, total_rows = db.execute(totals_stmt).one()

    column = {"activity_date": LedgerEntry.activity_date, "co2e_kg": LedgerEntry.co2e_kg,
              "created_at": LedgerEntry.created_at}[sort.lstrip("-")]
    stmt = stmt.order_by(column.desc() if sort.startswith("-") else column.asc(), LedgerEntry.id.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    rows = db.execute(stmt).unique().scalars().all()
    total_rows = int(total_rows or 0)
    return EntryPage(
        items=[EntryOut.from_entry(e) for e in rows],
        meta=Page(
            total=total_rows,
            page=page,
            page_size=page_size,
            pages=max(1, -(-total_rows // page_size)),  # ceiling division
        ),
        totals={"net_kg": round(float(net or 0.0), 3)},
    )


@router.get("/{entry_id}", response_model=EntryOut)
def get_entry(entry_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = db.execute(
        select(LedgerEntry)
        .options(joinedload(LedgerEntry.factor))
        .where(LedgerEntry.id == entry_id, LedgerEntry.org_id == user.org_id)
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return EntryOut.from_entry(entry)


@router.patch("/{entry_id}", response_model=EntryOut)
def update_reference(
    entry_id: int,
    payload: EntryUpdate,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
):
    """Only the reference text can change. To correct a number, void and repost."""
    entry = db.execute(
        select(LedgerEntry)
        .options(joinedload(LedgerEntry.factor))
        .where(LedgerEntry.id == entry_id, LedgerEntry.org_id == user.org_id)
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if entry.status is EntryStatus.VOIDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "A voided entry cannot be edited")

    entry.reference = payload.reference
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="entry.update", entity="ledger_entry",
                    entity_id=entry.id, detail={"reference": payload.reference}))
    db.commit()
    db.refresh(entry)
    return EntryOut.from_entry(entry)


@router.post("/{entry_id}/void", response_model=EntryOut)
def void_entry(
    entry_id: int,
    payload: EntryVoid,
    user: User = Depends(require_writer),
    db: Session = Depends(get_db),
):
    """Reverse an entry. The row stays; it just stops counting."""
    from datetime import datetime, timezone

    entry = db.execute(
        select(LedgerEntry)
        .options(joinedload(LedgerEntry.factor))
        .where(LedgerEntry.id == entry_id, LedgerEntry.org_id == user.org_id)
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if entry.status is EntryStatus.VOIDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Entry is already voided")

    entry.status = EntryStatus.VOIDED
    entry.void_reason = payload.reason
    entry.voided_at = datetime.now(timezone.utc)
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="entry.void", entity="ledger_entry",
                    entity_id=entry.id, detail={"reason": payload.reason}))
    db.commit()
    db.refresh(entry)
    return EntryOut.from_entry(entry)
