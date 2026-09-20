"""Read-only analytics endpoints that back the dashboard screen."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Organization, User
from app.schemas import (
    CategoryBreakdown,
    Insight,
    MonthPoint,
    OrganizationOut,
    ResourceTotals,
    ScoreOut,
    SubScore,
    SummaryOut,
)
from app.security import get_current_user
from app.services import analytics

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MonthsQuery = Query(6, ge=1, le=60, description="Length of the reporting period, in calendar months")


def _score_out(score, start, end, months) -> ScoreOut:
    return ScoreOut(
        composite=score.composite,
        grade=score.grade,
        subscores=[SubScore(**s.__dict__) for s in score.subscores],
        period_start=start,
        period_end=end,
        months=months,
    )


@router.get("/summary", response_model=SummaryOut)
def summary(
    months: int = MonthsQuery,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One call that fills the entire top half of the dashboard.

    Deliberately a single endpoint: the frontend should not have to fire
    six requests and stitch the answers together to paint one screen.
    """
    org = db.get(Organization, user.org_id)
    score, carbon, res, start, end = analytics.score_for_period(db, org, months)
    scopes = analytics.by_scope(db, org.id, start, end)

    denom = max(1, org.headcount) * max(1, months)
    return SummaryOut(
        organization=OrganizationOut.model_validate(org),
        period_start=start,
        period_end=end,
        months=months,
        gross_kg=carbon["gross_kg"],
        avoided_kg=carbon["avoided_kg"],
        net_kg=carbon["net_kg"],
        net_per_employee_month=round(carbon["net_kg"] / denom, 3),
        by_scope=scopes,
        resources=ResourceTotals(**res),
        renewable_share_pct=round(100 * res["renewable_kwh"] / res["energy_kwh"], 2) if res["energy_kwh"] else 0.0,
        diversion_rate_pct=round(100 * res["diverted_kg"] / res["waste_kg"], 2) if res["waste_kg"] else 0.0,
        low_carbon_share_pct=round(100 * res["low_carbon_km"] / res["distance_km"], 2) if res["distance_km"] else 0.0,
        score=_score_out(score, start, end, months),
    )


@router.get("/score", response_model=ScoreOut)
def score(months: int = MonthsQuery, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.org_id)
    result, _c, _r, start, end = analytics.score_for_period(db, org, months)
    return _score_out(result, start, end, months)


@router.get("/trend", response_model=list[MonthPoint])
def trend(
    months: int = Query(12, ge=2, le=60),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Gross, avoided and net per month — zero-filled, oldest first."""
    return [MonthPoint(**row) for row in analytics.monthly_series(db, user.org_id, months)]


@router.get("/by-category", response_model=list[CategoryBreakdown])
def by_category(months: int = MonthsQuery, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = analytics.period_bounds(months)
    return [CategoryBreakdown(**row) for row in analytics.by_category(db, user.org_id, start, end)]


@router.get("/resources", response_model=ResourceTotals)
def resources(months: int = MonthsQuery, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = analytics.period_bounds(months)
    return ResourceTotals(**analytics.resource_totals(db, user.org_id, start, end))


@router.get("/insights", response_model=list[Insight])
def insights(months: int = MonthsQuery, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Quantified recommendations, ranked by the size of the opportunity."""
    org = db.get(Organization, user.org_id)
    return [Insight(**row) for row in analytics.build_insights(db, org, months)]
