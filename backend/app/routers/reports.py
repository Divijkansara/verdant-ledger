"""Export endpoints — the ledger leaving the system as evidence."""

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import EmissionFactor, LedgerEntry, Organization, User
from app.security import get_current_user
from app.services import analytics

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/entries.csv")
def entries_csv(
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream the ledger as CSV.

    StreamingResponse rather than building one big string: a three-year
    ledger should not have to fit in memory to be downloaded.
    """
    stmt = (
        select(LedgerEntry)
        .options(joinedload(LedgerEntry.factor))
        .where(LedgerEntry.org_id == user.org_id)
        .order_by(LedgerEntry.activity_date.desc())
    )
    if date_from:
        stmt = stmt.where(LedgerEntry.activity_date >= date_from)
    if date_to:
        stmt = stmt.where(LedgerEntry.activity_date <= date_to)

    rows = db.execute(stmt).unique().scalars().all()

    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            ["entry_id", "activity_date", "category", "activity", "quantity", "unit",
             "factor_kg_per_unit", "co2e_kg", "scope", "status", "reference"]
        )
        yield buffer.getvalue()
        buffer.seek(0), buffer.truncate(0)

        for e in rows:
            writer.writerow([
                e.id, e.activity_date.isoformat(), e.factor.category.value, e.factor.label,
                e.quantity, e.unit_snapshot, e.factor_value_snapshot, e.co2e_kg,
                f"Scope {e.scope_snapshot}", e.status.value, e.reference or "",
            ])
            yield buffer.getvalue()
            buffer.seek(0), buffer.truncate(0)

    filename = f"ledger-{date.today().isoformat()}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/monthly")
def monthly_report(
    months: int = Query(12, ge=1, le=60),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A disclosure-shaped JSON report: period, totals by scope, by category,
    the month series and the score. This is the payload you would hand to an
    auditor or paste into a sustainability report."""
    org = db.get(Organization, user.org_id)
    score, carbon, res, start, end = analytics.score_for_period(db, org, months)
    return {
        "organization": {"name": org.name, "headcount": org.headcount, "country": org.country},
        "period": {"start": start.isoformat(), "end": end.isoformat(), "months": months},
        "totals_kg": carbon,
        "by_scope_kg": analytics.by_scope(db, org.id, start, end),
        "by_category_kg": [
            {"category": c["category"].value, "co2e_kg": c["co2e_kg"], "share_pct": c["share_pct"]}
            for c in analytics.by_category(db, org.id, start, end)
        ],
        "monthly_kg": analytics.monthly_series(db, org.id, months),
        "resources": res,
        "score": score.as_dict(),
        "basis": "GHG Protocol Corporate Standard; factors as cited per activity in /api/factors",
    }
