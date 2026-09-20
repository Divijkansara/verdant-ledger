"""Pydantic v2 schemas — the API contract.

Request models validate input before it reaches the database; response
models decide exactly what leaves the server (a password hash never can).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import Category, EntryStatus, ResourceKind, Role

ORM = ConfigDict(from_attributes=True)


# ─────────────────────────────── auth ────────────────────────────────


class RegisterRequest(BaseModel):
    org_name: str = Field(min_length=2, max_length=160)
    headcount: int = Field(ge=1, le=500_000)
    sector: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserOut(BaseModel):
    model_config = ORM
    id: int
    name: str
    email: EmailStr
    role: Role
    org_id: int


class OrganizationOut(BaseModel):
    model_config = ORM
    id: int
    name: str
    sector: str | None
    country: str
    headcount: int


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    sector: str | None = None
    headcount: int | None = Field(default=None, ge=1, le=500_000)


# ────────────────────────── emission factors ─────────────────────────


class FactorOut(BaseModel):
    model_config = ORM
    id: int
    category: Category
    activity_code: str
    label: str
    unit: str
    factor_value: float
    scope: int
    source: str
    resource_kind: ResourceKind
    is_renewable: bool
    is_diverted: bool
    is_low_carbon: bool
    is_credit: bool
    valid_from: date
    valid_to: date | None


class FactorCreate(BaseModel):
    category: Category
    activity_code: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=2, max_length=160)
    unit: str = Field(min_length=1, max_length=24)
    factor_value: float
    scope: int = Field(ge=1, le=3)
    source: str = Field(min_length=3, max_length=200)
    resource_kind: ResourceKind = ResourceKind.NONE
    resource_per_unit: float = 1.0
    is_renewable: bool = False
    is_diverted: bool = False
    is_low_carbon: bool = False
    valid_from: date


class FactorUpdate(BaseModel):
    label: str | None = None
    factor_value: float | None = None
    source: str | None = None
    valid_to: date | None = None
    is_active: bool | None = None


# ───────────────────────────── entries ───────────────────────────────


class EntryCreate(BaseModel):
    factor_id: int
    activity_date: date
    quantity: float = Field(gt=0, description="Activity amount in the factor's unit")
    reference: str | None = Field(default=None, max_length=500)

    @field_validator("activity_date")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("activity_date cannot be in the future")
        return v


class EntryUpdate(BaseModel):
    """Only the free-text reference is editable — the numbers are immutable."""

    reference: str | None = Field(default=None, max_length=500)


class EntryVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class EntryOut(BaseModel):
    model_config = ORM
    id: int
    activity_date: date
    quantity: float
    unit_snapshot: str
    factor_value_snapshot: float
    co2e_kg: float
    scope_snapshot: int
    reference: str | None
    status: EntryStatus
    created_at: datetime
    category: Category
    activity_label: str

    @classmethod
    def from_entry(cls, e) -> EntryOut:
        return cls(
            id=e.id,
            activity_date=e.activity_date,
            quantity=e.quantity,
            unit_snapshot=e.unit_snapshot,
            factor_value_snapshot=e.factor_value_snapshot,
            co2e_kg=e.co2e_kg,
            scope_snapshot=e.scope_snapshot,
            reference=e.reference,
            status=e.status,
            created_at=e.created_at,
            category=e.factor.category,
            activity_label=e.factor.label,
        )


class Page(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int


class EntryPage(BaseModel):
    items: list[EntryOut]
    meta: Page
    totals: dict[str, float]


class EntryPreview(BaseModel):
    """What the 'Log activity' screen shows before the user commits."""

    factor_id: int
    label: str
    quantity: float
    unit: str
    factor_value: float
    co2e_kg: float
    scope: int
    is_credit: bool


# ──────────────────────────── analytics ──────────────────────────────


class CategoryBreakdown(BaseModel):
    category: Category
    co2e_kg: float
    share_pct: float
    entry_count: int


class MonthPoint(BaseModel):
    month: str                 # "2026-09"
    gross_kg: float
    avoided_kg: float
    net_kg: float


class ResourceTotals(BaseModel):
    energy_kwh: float
    renewable_kwh: float
    water_kl: float
    waste_kg: float
    diverted_kg: float
    paper_kg: float
    distance_km: float
    low_carbon_km: float
    spend_inr_000: float


class SubScore(BaseModel):
    key: str
    label: str
    value: float               # 0-100
    weight: float
    observed: float
    unit: str
    target: float
    ceiling: float
    band: str                  # good | warning | critical


class ScoreOut(BaseModel):
    composite: float
    grade: str
    subscores: list[SubScore]
    period_start: date
    period_end: date
    months: int


class SummaryOut(BaseModel):
    organization: OrganizationOut
    period_start: date
    period_end: date
    months: int
    gross_kg: float
    avoided_kg: float
    net_kg: float
    net_per_employee_month: float
    by_scope: dict[str, float]
    resources: ResourceTotals
    renewable_share_pct: float
    diversion_rate_pct: float
    low_carbon_share_pct: float
    score: ScoreOut


class Insight(BaseModel):
    key: str
    severity: str              # info | warning | critical
    title: str
    detail: str
    estimated_saving_kg: float | None = None
