"""Emission factor catalogue.

Read access for everyone signed in (the 'Log activity' screen needs it and
the Methodology screen publishes it); write access for admins only,
because changing a factor changes every future number in the report.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, Category, EmissionFactor, User
from app.schemas import FactorCreate, FactorOut, FactorUpdate
from app.security import get_current_user, require_admin

router = APIRouter(prefix="/api/factors", tags=["emission factors"])


@router.get("", response_model=list[FactorOut])
def list_factors(
    category: Category | None = Query(None, description="Filter to one activity category"),
    active_only: bool = Query(True),
    on_date: date | None = Query(None, description="Factors valid on this date"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(EmissionFactor)
    if category:
        stmt = stmt.where(EmissionFactor.category == category)
    if active_only:
        stmt = stmt.where(EmissionFactor.is_active.is_(True))
    if on_date:
        stmt = stmt.where(
            EmissionFactor.valid_from <= on_date,
            (EmissionFactor.valid_to.is_(None)) | (EmissionFactor.valid_to >= on_date),
        )
    stmt = stmt.order_by(EmissionFactor.category, EmissionFactor.label)
    return [FactorOut.model_validate(f) for f in db.execute(stmt).scalars().all()]


@router.get("/{factor_id}", response_model=FactorOut)
def get_factor(factor_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    factor = db.get(EmissionFactor, factor_id)
    if factor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emission factor not found")
    return FactorOut.model_validate(factor)


@router.post("", response_model=FactorOut, status_code=status.HTTP_201_CREATED)
def create_factor(payload: FactorCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    factor = EmissionFactor(**payload.model_dump())
    db.add(factor)
    db.flush()
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="factor.create",
                    entity="emission_factor", entity_id=factor.id, detail={"label": factor.label}))
    db.commit()
    db.refresh(factor)
    return FactorOut.model_validate(factor)


@router.patch("/{factor_id}", response_model=FactorOut)
def update_factor(
    factor_id: int,
    payload: FactorUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Note: updating a factor does NOT restate past entries.

    Each entry keeps the factor value it was priced with, so historical
    reports stay reproducible. New postings pick up the new value.
    """
    factor = db.get(EmissionFactor, factor_id)
    if factor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emission factor not found")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(factor, field, value)
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="factor.update",
                    entity="emission_factor", entity_id=factor.id, detail=changes))
    db.commit()
    db.refresh(factor)
    return FactorOut.model_validate(factor)


@router.delete("/{factor_id}", status_code=status.HTTP_204_NO_CONTENT)
def retire_factor(factor_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Retires a factor (is_active = False) rather than deleting the row —
    entries already priced with it must keep a valid foreign key."""
    factor = db.get(EmissionFactor, factor_id)
    if factor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emission factor not found")
    factor.is_active = False
    factor.valid_to = factor.valid_to or date.today()
    db.add(AuditLog(org_id=user.org_id, user_id=user.id, action="factor.retire",
                    entity="emission_factor", entity_id=factor.id, detail=None))
    db.commit()
