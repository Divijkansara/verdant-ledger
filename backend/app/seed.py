"""Seed the database: the emission factor catalogue plus a demo organisation
with twelve months of realistic ledger entries.

    python -m app.seed          # factors + demo org + sample ledger
    python -m app.seed --factors-only
    python -m app.seed --reset  # drop everything first

Every factor carries its source. If the examiner asks "where did 0.716 come
from?", the answer is in the row, not in someone's memory.
"""

from __future__ import annotations

import argparse
import random
from calendar import monthrange
from datetime import date

from sqlalchemy import select

from app.database import Base, SessionLocal, engine, init_db
from app.models import (
    Category as C,
    EmissionFactor,
    LedgerEntry,
    Organization,
    ResourceKind as R,
    Role,
    User,
)
from app.security import hash_password
from app.services.calculator import price_activity

DEFRA = "DEFRA/BEIS UK Government GHG Conversion Factors 2024"
CEA = "Central Electricity Authority, CO2 Baseline Database for the Indian Power Sector v20"
EEIO = "Spend-based EEIO screening factor (input-output derived)"

VALID_FROM = date(2024, 4, 1)

# (category, code, label, unit, factor, scope, source, resource_kind,
#  resource_per_unit, renewable, diverted, low_carbon)
FACTORS: list[tuple] = [
    # ── electricity ────────────────────────────────────────────────────
    (C.ELECTRICITY, "grid",   "Grid electricity",                  "kWh",   0.716, 2, CEA,   R.ENERGY_KWH, 1, False, False, False),
    (C.ELECTRICITY, "dg_set", "Diesel generator set",              "kWh",   0.850, 1, DEFRA, R.ENERGY_KWH, 1, False, False, False),
    (C.ELECTRICITY, "green_tariff", "Green tariff / REC-backed",   "kWh",   0.000, 2, CEA,   R.ENERGY_KWH, 1, True,  False, False),
    # ── water ──────────────────────────────────────────────────────────
    (C.WATER, "supply",  "Municipal water supply",                 "kL",    0.344, 3, DEFRA, R.WATER_KL, 1, False, False, False),
    (C.WATER, "treated", "Wastewater treated",                     "kL",    0.708, 3, DEFRA, R.NONE,     1, False, False, False),
    (C.WATER, "tanker",  "Tanker water (incl. haulage)",           "kL",    0.610, 3, DEFRA, R.WATER_KL, 1, False, False, False),
    # ── waste ──────────────────────────────────────────────────────────
    (C.WASTE, "landfill", "Mixed waste to landfill",               "kg",    0.586, 3, DEFRA, R.WASTE_KG, 1, False, False, False),
    (C.WASTE, "incinerated", "Incineration with energy recovery",  "kg",    0.021, 3, DEFRA, R.WASTE_KG, 1, False, False, False),
    (C.WASTE, "composted", "Organic waste composted",              "kg",    0.010, 3, DEFRA, R.WASTE_KG, 1, False, True,  False),
    (C.WASTE, "ewaste_landfill", "E-waste to landfill",            "kg",    1.200, 3, DEFRA, R.WASTE_KG, 1, False, False, False),
    # ── transport ──────────────────────────────────────────────────────
    (C.TRANSPORT, "car_petrol", "Company car - petrol",            "km",    0.170, 1, DEFRA, R.DISTANCE_KM, 1, False, False, False),
    (C.TRANSPORT, "car_diesel", "Company car - diesel",            "km",    0.171, 1, DEFRA, R.DISTANCE_KM, 1, False, False, False),
    (C.TRANSPORT, "ev",         "Electric vehicle",                "km",    0.112, 2, CEA,   R.DISTANCE_KM, 1, False, False, True),
    (C.TRANSPORT, "two_wheeler","Two-wheeler - petrol",            "km",    0.049, 1, DEFRA, R.DISTANCE_KM, 1, False, False, True),
    (C.TRANSPORT, "taxi",       "Taxi / auto-rickshaw",            "km",    0.148, 3, DEFRA, R.DISTANCE_KM, 1, False, False, False),
    (C.TRANSPORT, "bus",        "Bus (public transit)",            "km",    0.103, 3, DEFRA, R.DISTANCE_KM, 1, False, False, True),
    (C.TRANSPORT, "metro",      "Metro / suburban rail",           "km",    0.028, 3, DEFRA, R.DISTANCE_KM, 1, False, False, True),
    (C.TRANSPORT, "flight_dom", "Domestic flight",                 "km",    0.246, 3, DEFRA, R.DISTANCE_KM, 1, False, False, False),
    (C.TRANSPORT, "flight_intl","International flight (economy)",  "km",    0.150, 3, DEFRA, R.DISTANCE_KM, 1, False, False, False),
    # ── paper ──────────────────────────────────────────────────────────
    (C.PAPER, "a4_sheet", "A4 sheet, virgin (80 gsm)",             "sheets", 0.0046, 3, DEFRA, R.PAPER_KG, 0.005, False, False, False),
    (C.PAPER, "a4_ream",  "A4 ream, virgin (500 sheets)",          "reams",  2.298,  3, DEFRA, R.PAPER_KG, 2.5,   False, False, False),
    (C.PAPER, "recycled", "Recycled-content paper",                "kg",     0.628,  3, DEFRA, R.PAPER_KG, 1,     False, False, False),
    (C.PAPER, "cardboard","Cardboard packaging",                   "kg",     0.821,  3, DEFRA, R.PAPER_KG, 1,     False, False, False),
    # ── procurement (spend-based screening) ────────────────────────────
    (C.PROCUREMENT, "it_equipment", "IT & electronics",            "INR_000", 5.4, 3, EEIO, R.SPEND, 1, False, False, False),
    (C.PROCUREMENT, "furniture",    "Furniture & fixtures",        "INR_000", 4.8, 3, EEIO, R.SPEND, 1, False, False, False),
    (C.PROCUREMENT, "consumables",  "Office consumables",          "INR_000", 3.6, 3, EEIO, R.SPEND, 1, False, False, False),
    (C.PROCUREMENT, "catering",     "Food & catering",             "INR_000", 6.2, 3, EEIO, R.SPEND, 1, False, False, False),
    (C.PROCUREMENT, "services",     "Professional services",       "INR_000", 1.1, 3, EEIO, R.SPEND, 1, False, False, False),
    (C.PROCUREMENT, "construction", "Construction & maintenance",  "INR_000", 7.5, 3, EEIO, R.SPEND, 1, False, False, False),
    # ── recycling (credits) ────────────────────────────────────────────
    (C.RECYCLING, "paper",   "Paper & cardboard recycled",         "kg", -0.90, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    (C.RECYCLING, "plastic", "Plastics recycled",                  "kg", -1.45, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    (C.RECYCLING, "aluminium","Aluminium recycled",                "kg", -8.90, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    (C.RECYCLING, "steel",   "Steel & other metals recycled",      "kg", -1.75, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    (C.RECYCLING, "glass",   "Glass recycled",                     "kg", -0.32, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    (C.RECYCLING, "ewaste",  "E-waste to authorised recycler",     "kg", -1.10, 3, DEFRA, R.WASTE_KG, 1, False, True, False),
    # ── renewable energy (credits) ─────────────────────────────────────
    (C.RENEWABLE, "solar_pv", "Rooftop solar - self-consumed",     "kWh", -0.716, 2, CEA,   R.ENERGY_KWH, 1, True, False, False),
    (C.RENEWABLE, "ppa",      "Wind / solar PPA",                  "kWh", -0.716, 2, CEA,   R.ENERGY_KWH, 1, True, False, False),
    (C.RENEWABLE, "solar_thermal", "Solar water heating",          "kWh", -0.450, 1, DEFRA, R.NONE,       1, True, False, False),
    (C.RENEWABLE, "biogas",   "Canteen biogas",                    "kWh", -0.550, 1, DEFRA, R.NONE,       1, True, False, False),
]


def seed_factors(db) -> dict[str, EmissionFactor]:
    """Insert any factor that is not already present. Safe to re-run."""
    existing = {
        (f.category, f.activity_code): f
        for f in db.execute(select(EmissionFactor)).scalars().all()
    }
    created = 0
    for (cat, code, label, unit, value, scope, source, kind, per_unit, ren, div, low) in FACTORS:
        if (cat, code) in existing:
            continue
        factor = EmissionFactor(
            category=cat, activity_code=code, label=label, unit=unit, factor_value=value,
            scope=scope, source=source, resource_kind=kind, resource_per_unit=per_unit,
            is_renewable=ren, is_diverted=div, is_low_carbon=low, valid_from=VALID_FROM,
        )
        db.add(factor)
        existing[(cat, code)] = factor
        created += 1
    db.commit()
    print(f"  emission factors: {created} inserted, {len(FACTORS) - created} already present")
    return {f"{k[0].value}:{k[1]}": v for k, v in existing.items()}


# ───────────────────── demo organisation + ledger ────────────────────

# (factor key, day of month, base quantity, trend per month, jitter, reference)
# trend is the change applied linearly across the 12 months, so the demo data
# tells a story: solar rising, landfill falling, the EV fleet growing.
PATTERN = [
    ("electricity:grid",        4, 17800, -1900, 0.06, "TNEB meter reading"),
    ("electricity:dg_set",      4,   520,  -180, 0.35, "Backup DG runtime log"),
    ("renewable:solar_pv",      6,   900,  2600, 0.12, "Rooftop array, 96 kWp"),
    ("renewable:biogas",        7,   220,   180, 0.20, "Canteen digester"),
    ("water:supply",            5,   492,   -55, 0.07, "Corporation supply"),
    ("water:treated",           5,   384,   -40, 0.07, "STP outflow"),
    ("waste:landfill",         28,  1420,  -520, 0.10, "Municipal pickup"),
    ("waste:composted",        28,   360,   340, 0.12, "Canteen organics"),
    ("recycling:paper",        27,   520,   240, 0.12, "Baled, monthly uplift"),
    ("recycling:plastic",      27,   140,    90, 0.16, "PET and HDPE"),
    ("recycling:aluminium",    27,    28,    22, 0.30, "Cans and scrap"),
    ("recycling:steel",        27,    70,    40, 0.30, "Workshop offcuts"),
    ("transport:car_petrol",   30,  6100, -2400, 0.12, "Fleet odometer"),
    ("transport:ev",           30,   400,  4200, 0.15, "e-fleet telematics"),
    ("transport:taxi",         30,  2350,     0, 0.18, "Reimbursed cabs"),
    ("transport:metro",        30,  7600,  3200, 0.10, "Commute survey"),
    ("transport:bus",          30,  2900,   900, 0.12, "Shuttle service"),
    ("transport:two_wheeler",  30,  3100,     0, 0.15, "Commute survey"),
    ("paper:a4_ream",           9,    96,   -46, 0.12, "Stationery issue"),
    ("paper:cardboard",         9,   210,   -60, 0.20, "Inbound packaging"),
    ("procurement:it_equipment",12,  430,     0, 0.30, "Hardware refresh"),
    ("procurement:catering",   12,   318,     0, 0.12, "Canteen contract"),
    ("procurement:consumables",12,    88,     0, 0.25, "Office supplies"),
    ("procurement:services",   12,   690,     0, 0.18, "Audit and consulting"),
]

OCCASIONAL = [
    ("transport:flight_dom",  15,  9800, 0.42, "Client travel"),
    ("transport:flight_intl", 15, 14200, 0.80, "Conference travel"),
    ("waste:ewaste_landfill", 22,    46, 0.70, "Decommissioned units"),
    ("water:tanker",          19,    58, 0.62, "Summer top-up"),
    ("procurement:furniture", 20,   160, 0.75, "Workstation batch"),
]


def add_months(d: date, delta: int) -> date:
    idx = d.month - 1 + delta
    year, month = d.year + idx // 12, idx % 12 + 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


DEMO_ADMIN_NAME = "JETT REVIVE ME >.<"


def seed_demo_org(db, factors: dict[str, EmissionFactor]) -> Organization:
    org = db.execute(select(Organization).where(Organization.name == "Suryanagar Technologies Pvt Ltd")).scalar_one_or_none()
    if org:
        # The demo account is already there. Its display name is the one
        # thing worth keeping in step, since a deployment seeded once and
        # never again would otherwise show whatever it was seeded with.
        admin = db.execute(
            select(User).where(User.email == "admin@suryanagar.example")).scalar_one_or_none()
        if admin and admin.name != DEMO_ADMIN_NAME:
            admin.name = DEMO_ADMIN_NAME
            db.commit()
        print("  demo organisation already exists — skipping")
        return org

    org = Organization(
        name="Suryanagar Technologies Pvt Ltd",
        sector="Information technology services",
        headcount=120,
        country="India",
    )
    db.add(org)
    db.flush()

    users = [
        (DEMO_ADMIN_NAME, "admin@suryanagar.example", Role.ADMIN),
        ("Meera Iyer", "facilities@suryanagar.example", Role.CONTRIBUTOR),
        ("Auditor", "auditor@suryanagar.example", Role.VIEWER),
    ]
    for name, email, role in users:
        db.add(User(org_id=org.id, name=name, email=email,
                    password_hash=hash_password("password123"), role=role))
    db.flush()
    admin = db.execute(select(User).where(User.email == "admin@suryanagar.example")).scalar_one()

    rng = random.Random(20260911)
    today = date.today()
    posted = 0

    for back in range(11, -1, -1):
        first = add_months(today.replace(day=1), -back)
        days_in_month = monthrange(first.year, first.month)[1]
        # the current month is only partly elapsed — scale it accordingly
        partial = min(1.0, today.day / days_in_month) if back == 0 else 1.0
        progress = (11 - back) / 11

        def post(key: str, day: int, quantity: float, reference: str) -> None:
            nonlocal posted
            factor = factors.get(key)
            if factor is None or quantity <= 0:
                return
            when = date(first.year, first.month, min(day, days_in_month))
            priced = price_activity(factor, round(quantity, 2))
            db.add(LedgerEntry(
                org_id=org.id, factor_id=factor.id, created_by_id=admin.id,
                activity_date=when, quantity=round(quantity, 2), reference=reference,
                factor_value_snapshot=priced.factor_value, unit_snapshot=priced.unit,
                scope_snapshot=priced.scope, co2e_kg=priced.co2e_kg,
            ))
            posted += 1

        for key, day, base, trend, jitter, reference in PATTERN:
            qty = (base + trend * progress) * (1 + (rng.random() - 0.5) * 2 * jitter) * partial
            post(key, day, qty, reference)

        for key, day, base, threshold, reference in OCCASIONAL:
            if rng.random() > threshold:
                post(key, day, base * (1 + (rng.random() - 0.5) * 0.6) * partial, reference)

    db.commit()
    print(f"  demo organisation seeded with {posted} ledger entries across 12 months")
    print("  login: admin@suryanagar.example / password123")
    return org


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Terrawise database")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    parser.add_argument("--factors-only", action="store_true", help="skip the demo organisation")
    args = parser.parse_args()

    if args.reset:
        print("Dropping all tables...")
        Base.metadata.drop_all(bind=engine)

    init_db()
    print("Seeding:")
    with SessionLocal() as db:
        factors = seed_factors(db)
        if not args.factors_only:
            seed_demo_org(db, factors)
    print("Done.")


if __name__ == "__main__":
    main()
