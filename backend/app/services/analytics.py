"""Aggregation queries behind the dashboard.

Every number the dashboard shows is computed here with SQL GROUP BY rather
than by pulling rows into Python and looping. That keeps the API fast as
the ledger grows and puts the work where the database is good at it.

Voided entries are excluded from every aggregate — they remain in the
table for audit, but they are not part of the reported position.
"""

from __future__ import annotations

from datetime import date
from calendar import monthrange

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.database import engine
from app.models import Category, EmissionFactor, EntryStatus, LedgerEntry, Organization, ResourceKind
from app.services.scoring import ScoreInput, ScoreResult, compute_score

# ───────────────────────────── periods ───────────────────────────────


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, delta: int) -> date:
    """Shift a date by whole months, clamping the day to a valid one."""
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def period_bounds(months: int, today: date | None = None) -> tuple[date, date]:
    """The last `months` calendar months, ending today.

    months=1 means the current month to date, which is what a user who
    picks 'this month' expects to see.
    """
    today = today or date.today()
    start = month_start(add_months(today, -(months - 1)))
    return start, today


def month_keys(start: date, end: date) -> list[str]:
    keys, cur = [], month_start(start)
    while cur <= end:
        keys.append(f"{cur.year:04d}-{cur.month:02d}")
        cur = add_months(cur, 1)
    return keys


# ─────────────────────────── base query ──────────────────────────────


# Grouping by month is the one place the two supported databases differ:
# SQLite has strftime, PostgreSQL has to_char. Isolating it in one helper
# keeps every query below portable.
def _month_expr():
    if engine.dialect.name == "postgresql":
        return func.to_char(LedgerEntry.activity_date, "YYYY-MM")
    return func.strftime("%Y-%m", LedgerEntry.activity_date)


# ───────────────────────────── totals ────────────────────────────────


def carbon_totals(db: Session, org_id: int, start: date, end: date) -> dict[str, float]:
    """Gross emissions, avoided emissions and the net position, in kg."""
    gross = func.sum(case((LedgerEntry.co2e_kg > 0, LedgerEntry.co2e_kg), else_=0.0))
    avoided = func.sum(case((LedgerEntry.co2e_kg < 0, -LedgerEntry.co2e_kg), else_=0.0))
    row = db.execute(
        select(gross, avoided, func.count(LedgerEntry.id)).where(
            LedgerEntry.org_id == org_id,
            LedgerEntry.status == EntryStatus.POSTED,
            LedgerEntry.activity_date >= start,
            LedgerEntry.activity_date <= end,
        )
    ).one()
    g = float(row[0] or 0.0)
    a = float(row[1] or 0.0)
    return {"gross_kg": round(g, 3), "avoided_kg": round(a, 3), "net_kg": round(g - a, 3),
            "entry_count": int(row[2] or 0)}


def by_scope(db: Session, org_id: int, start: date, end: date) -> dict[str, float]:
    rows = db.execute(
        select(LedgerEntry.scope_snapshot, func.sum(LedgerEntry.co2e_kg))
        .where(
            LedgerEntry.org_id == org_id,
            LedgerEntry.status == EntryStatus.POSTED,
            LedgerEntry.activity_date >= start,
            LedgerEntry.activity_date <= end,
        )
        .group_by(LedgerEntry.scope_snapshot)
    ).all()
    out = {"scope_1": 0.0, "scope_2": 0.0, "scope_3": 0.0}
    for scope, total in rows:
        out[f"scope_{int(scope)}"] = round(float(total or 0.0), 3)
    return out


def by_category(db: Session, org_id: int, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(
            EmissionFactor.category,
            func.sum(LedgerEntry.co2e_kg),
            func.count(LedgerEntry.id),
        )
        .join(EmissionFactor, LedgerEntry.factor_id == EmissionFactor.id)
        .where(
            LedgerEntry.org_id == org_id,
            LedgerEntry.status == EntryStatus.POSTED,
            LedgerEntry.activity_date >= start,
            LedgerEntry.activity_date <= end,
        )
        .group_by(EmissionFactor.category)
    ).all()

    totals = {cat: (float(t or 0.0), int(c or 0)) for cat, t, c in rows}
    gross = sum(v for v, _ in totals.values() if v > 0) or 1.0

    out = []
    for cat in Category:
        value, count = totals.get(cat, (0.0, 0))
        out.append(
            {
                "category": cat,
                "co2e_kg": round(value, 3),
                "share_pct": round(100.0 * value / gross, 2) if value > 0 else 0.0,
                "entry_count": count,
            }
        )
    out.sort(key=lambda r: r["co2e_kg"], reverse=True)
    return out


def monthly_series(db: Session, org_id: int, months: int, today: date | None = None) -> list[dict]:
    """Gross / avoided / net per calendar month, zero-filled so the chart
    always has a bar for every month in the window."""
    start, end = period_bounds(months, today)
    gross = func.sum(case((LedgerEntry.co2e_kg > 0, LedgerEntry.co2e_kg), else_=0.0))
    avoided = func.sum(case((LedgerEntry.co2e_kg < 0, -LedgerEntry.co2e_kg), else_=0.0))

    rows = db.execute(
        select(_month_expr().label("m"), gross, avoided)
        .where(
            LedgerEntry.org_id == org_id,
            LedgerEntry.status == EntryStatus.POSTED,
            LedgerEntry.activity_date >= start,
            LedgerEntry.activity_date <= end,
        )
        .group_by("m")
        .order_by("m")
    ).all()

    found = {m: (float(g or 0.0), float(a or 0.0)) for m, g, a in rows}
    series = []
    for key in month_keys(start, end):
        g, a = found.get(key, (0.0, 0.0))
        series.append(
            {"month": key, "gross_kg": round(g, 3), "avoided_kg": round(a, 3), "net_kg": round(g - a, 3)}
        )
    return series


def resource_totals(db: Session, org_id: int, start: date, end: date) -> dict[str, float]:
    """Physical resource consumption, and the flagged subsets the score needs."""
    qty = LedgerEntry.quantity * func.coalesce(EmissionFactor.resource_per_unit, 1.0)

    def summed(condition) -> float:
        row = db.execute(
            select(func.sum(case((condition, qty), else_=0.0)))
            .select_from(LedgerEntry)
            .join(EmissionFactor, LedgerEntry.factor_id == EmissionFactor.id)
            .where(
                LedgerEntry.org_id == org_id,
                LedgerEntry.status == EntryStatus.POSTED,
                LedgerEntry.activity_date >= start,
                LedgerEntry.activity_date <= end,
            )
        ).scalar()
        return round(float(row or 0.0), 3)

    K = ResourceKind
    energy = summed(EmissionFactor.resource_kind == K.ENERGY_KWH)
    renewable = summed((EmissionFactor.resource_kind == K.ENERGY_KWH) & (EmissionFactor.is_renewable.is_(True)))
    waste = summed(EmissionFactor.resource_kind == K.WASTE_KG)
    diverted = summed((EmissionFactor.resource_kind == K.WASTE_KG) & (EmissionFactor.is_diverted.is_(True)))
    distance = summed(EmissionFactor.resource_kind == K.DISTANCE_KM)
    low_carbon = summed((EmissionFactor.resource_kind == K.DISTANCE_KM) & (EmissionFactor.is_low_carbon.is_(True)))

    return {
        "energy_kwh": energy,
        "renewable_kwh": renewable,
        "water_kl": summed(EmissionFactor.resource_kind == K.WATER_KL),
        "waste_kg": waste,
        "diverted_kg": diverted,
        "paper_kg": summed(EmissionFactor.resource_kind == K.PAPER_KG),
        "distance_km": distance,
        "low_carbon_km": low_carbon,
        "spend_inr_000": summed(EmissionFactor.resource_kind == K.SPEND),
    }


def score_for_period(
    db: Session, org: Organization, months: int, today: date | None = None
) -> tuple[ScoreResult, dict, dict, date, date]:
    """Compose the aggregates into a score. Returns (score, carbon, resources, start, end)."""
    start, end = period_bounds(months, today)
    carbon = carbon_totals(db, org.id, start, end)
    res = resource_totals(db, org.id, start, end)
    score = compute_score(
        ScoreInput(
            net_kg=carbon["net_kg"],
            headcount=org.headcount,
            months=months,
            energy_kwh=res["energy_kwh"],
            renewable_kwh=res["renewable_kwh"],
            waste_kg=res["waste_kg"],
            diverted_kg=res["diverted_kg"],
            water_kl=res["water_kl"],
            paper_kg=res["paper_kg"],
            distance_km=res["distance_km"],
            low_carbon_km=res["low_carbon_km"],
        )
    )
    return score, carbon, res, start, end


# ──────────────────────────── insights ───────────────────────────────

GRID_FACTOR_KG_PER_KWH = 0.716  # CEA India — used to size the solar opportunity
LANDFILL_FACTOR = 0.586
RECYCLING_CREDIT = 0.90


def build_insights(
    db: Session, org: Organization, months: int, today: date | None = None
) -> list[dict]:
    """Rule-based recommendations, each one quantified from the ledger.

    A dashboard that only reports is a spreadsheet. The insight rules are
    what make it a decision tool — every one names a number and an action.
    """
    score, carbon, res, start, end = score_for_period(db, org, months, today)
    cats = [c for c in by_category(db, org.id, start, end) if c["co2e_kg"] > 0]
    out: list[dict] = []

    if cats:
        top = cats[0]
        out.append(
            {
                "key": "largest_source",
                "severity": "info",
                "title": f"{top['category'].value.title()} is the largest single source",
                "detail": (
                    f"It accounts for {top['share_pct']:.0f}% of gross emissions "
                    f"({top['co2e_kg'] / 1000:.2f} t CO2e) over the period. A 10% cut here removes "
                    f"{top['co2e_kg'] * 0.1 / 1000:.2f} t."
                ),
                "estimated_saving_kg": round(top["co2e_kg"] * 0.1, 2),
            }
        )

    weakest = min(score.subscores, key=lambda s: s.value)
    gain = round((100 - weakest.value) * weakest.weight, 2)
    out.append(
        {
            "key": "weakest_subscore",
            "severity": "critical" if weakest.band == "critical" else "warning",
            "title": f"{weakest.label} is the weakest sub-score",
            "detail": (
                f"At {weakest.value:.0f}/100 it carries {weakest.weight * 100:.0f}% of the composite. "
                f"Closing it fully would lift the overall score by {gain:.1f} points, to "
                f"{min(100.0, score.composite + gain):.1f}."
            ),
            "estimated_saving_kg": None,
        }
    )

    if res["energy_kwh"] > 0:
        gap_kwh = max(0.0, 0.60 * res["energy_kwh"] - res["renewable_kwh"])
        if gap_kwh > 0:
            out.append(
                {
                    "key": "renewable_gap",
                    "severity": "warning",
                    "title": "Renewable electricity is below the 60% target",
                    "detail": (
                        f"Adding {gap_kwh:,.0f} kWh of on-site or contracted renewables over this period "
                        f"would reach the target and avoid about "
                        f"{gap_kwh * GRID_FACTOR_KG_PER_KWH / 1000:.2f} t CO2e."
                    ),
                    "estimated_saving_kg": round(gap_kwh * GRID_FACTOR_KG_PER_KWH, 2),
                }
            )

    landfill_kg = res["waste_kg"] - res["diverted_kg"]
    if landfill_kg > 0:
        saving = landfill_kg * 0.5 * (LANDFILL_FACTOR + RECYCLING_CREDIT)
        out.append(
            {
                "key": "landfill_diversion",
                "severity": "warning",
                "title": "Waste is still defaulting to landfill",
                "detail": (
                    f"{landfill_kg:,.0f} kg went to landfill this period. Diverting half of it to "
                    f"recycling and composting avoids roughly {saving / 1000:.2f} t CO2e once the "
                    f"recycling credit is counted."
                ),
                "estimated_saving_kg": round(saving, 2),
            }
        )

    return out
