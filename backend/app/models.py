"""ORM models — the persistent shape of the sustainability ledger.

Design notes that matter for evaluation
---------------------------------------
1.  Emission factors are DATA, not code.  They live in a table with a
    validity window and a cited source, so factors can be updated each
    year without touching a line of Python.

2.  A ledger entry SNAPSHOTS the factor value and scope it was priced
    with.  If DEFRA revises a factor next year, last year's reported
    numbers must not silently change.  This is the same restatement rule
    financial ledgers follow.

3.  Entries are append-only.  A mistake is corrected by VOIDING the
    entry (status -> voided, with a reason and an audit row), never by
    deleting the row.  An auditable trail is the whole point of a ledger.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────── enumerations ────────────────────────────


class Category(str, enum.Enum):
    """The eight activity categories the ledger records."""

    ELECTRICITY = "electricity"
    WATER = "water"
    WASTE = "waste"
    TRANSPORT = "transport"
    PAPER = "paper"
    PROCUREMENT = "procurement"
    RECYCLING = "recycling"
    RENEWABLE = "renewable"


class ResourceKind(str, enum.Enum):
    """What physical resource a factor's quantity measures.

    Carbon is only half the ledger — the resource totals drive the
    consumption and efficiency half of the sustainability score.
    """

    ENERGY_KWH = "energy_kwh"
    WATER_KL = "water_kl"
    WASTE_KG = "waste_kg"
    PAPER_KG = "paper_kg"
    DISTANCE_KM = "distance_km"
    SPEND = "spend"
    NONE = "none"


class Role(str, enum.Enum):
    ADMIN = "admin"            # manage users, factors, targets
    CONTRIBUTOR = "contributor"  # post and void entries
    VIEWER = "viewer"          # read-only dashboards


class EntryStatus(str, enum.Enum):
    POSTED = "posted"
    VOIDED = "voided"


# ───────────────────────────── models ────────────────────────────────


class Organization(Base):
    """The reporting entity. Every other row hangs off this (multi-tenant)."""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(80))
    country: Mapped[str] = mapped_column(String(80), default="India")
    headcount: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    reporting_year_start_month: Mapped[int] = mapped_column(Integer, default=4)  # Indian FY
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    users: Mapped[list[User]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    entries: Mapped[list[LedgerEntry]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    targets: Mapped[list[Target]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.CONTRIBUTOR, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="users")


class EmissionFactor(Base):
    """One priced activity: 'grid electricity, 0.716 kg CO2e per kWh, Scope 2'.

    A negative factor_value is a CREDIT — recycling and on-site renewables
    avoid emissions, so they reduce the net position.
    """

    __tablename__ = "emission_factors"
    __table_args__ = (
        UniqueConstraint("category", "activity_code", "valid_from", name="uq_factor_version"),
        Index("ix_factor_lookup", "category", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[Category] = mapped_column(SAEnum(Category), nullable=False)
    activity_code: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    unit: Mapped[str] = mapped_column(String(24), nullable=False)          # kWh, kL, kg, km, sheets, INR_000
    factor_value: Mapped[float] = mapped_column(Float, nullable=False)     # kg CO2e per unit
    scope: Mapped[int] = mapped_column(Integer, nullable=False)            # GHG Protocol 1 / 2 / 3
    source: Mapped[str] = mapped_column(String(200), nullable=False)       # citation — never leave blank

    # How this activity feeds the non-carbon half of the score
    resource_kind: Mapped[ResourceKind] = mapped_column(SAEnum(ResourceKind), default=ResourceKind.NONE)
    resource_per_unit: Mapped[float] = mapped_column(Float, default=1.0)   # e.g. 1 ream -> 2.5 kg paper
    is_renewable: Mapped[bool] = mapped_column(Boolean, default=False)     # counts to renewable share
    is_diverted: Mapped[bool] = mapped_column(Boolean, default=False)      # counts to waste diversion
    is_low_carbon: Mapped[bool] = mapped_column(Boolean, default=False)    # counts to mobility share

    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)                    # NULL = still current
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    entries: Mapped[list[LedgerEntry]] = relationship(back_populates="factor")

    @property
    def is_credit(self) -> bool:
        return self.factor_value < 0


class LedgerEntry(Base):
    """One posting: a quantity of activity on a date, priced in kg CO2e."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        Index("ix_entry_org_date", "org_id", "activity_date"),
        Index("ix_entry_org_status", "org_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    factor_id: Mapped[int] = mapped_column(ForeignKey("emission_factors.id"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    activity_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    reference: Mapped[str | None] = mapped_column(Text)   # invoice no., meter reading, department

    # ---- immutable snapshot of how this row was priced --------------------
    factor_value_snapshot: Mapped[float] = mapped_column(Float, nullable=False)
    unit_snapshot: Mapped[str] = mapped_column(String(24), nullable=False)
    scope_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    co2e_kg: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[EntryStatus] = mapped_column(SAEnum(EntryStatus), default=EntryStatus.POSTED, nullable=False)
    void_reason: Mapped[str | None] = mapped_column(Text)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="entries")
    factor: Mapped[EmissionFactor] = relationship(back_populates="entries")


class Target(Base):
    """A reduction target the dashboard measures progress against."""

    __tablename__ = "targets"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(String(60), nullable=False)   # carbon_per_employee, renewable_share, ...
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="targets")


class ScoreSnapshot(Base):
    """A computed score frozen for one period, so the score itself can trend."""

    __tablename__ = "score_snapshots"
    __table_args__ = (UniqueConstraint("org_id", "period_start", "period_end", name="uq_snapshot_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    composite: Mapped[float] = mapped_column(Float, nullable=False)
    grade: Mapped[str] = mapped_column(String(3), nullable=False)
    subscores: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    """Who did what, when. Written for every state-changing request."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_org_time", "org_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60), nullable=False)   # entry.create, entry.void, factor.update
    entity: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    detail: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SiteEvent(Base):
    """Everything a visitor does on the website: page views, clicks,
    scenario runs, sign-ins. Written by the anonymous POST /api/events
    endpoint, so it never touches the ledger itself."""

    __tablename__ = "site_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)  # view, click, scenario, login ...
    path: Mapped[str] = mapped_column(String(200), default="")
    detail: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class DashboardRole(str, enum.Enum):
    """What a person may do with a dashboard that is not theirs."""

    EDITOR = "editor"       # add activity, change settings
    VIEWER = "viewer"       # read the numbers and the reports


class Dashboard(Base):
    """One organisation or site, with its activity, belonging to a user.

    The whole dashboard travels as one JSON payload: the engine that
    computes every figure runs in the browser, so the server's job is to
    keep the record safe, hand it to the devices that may see it, and say
    who those are. That is also why the id is the one the client
    generated — the same dashboard keeps its identity offline and on.
    """

    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sector: Mapped[str] = mapped_column(String(80), default="")
    sample: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)     # { org, entries }
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship()
    members: Mapped[list["DashboardMember"]] = relationship(
        back_populates="dashboard", cascade="all, delete-orphan")


class DashboardMember(Base):
    """A colleague this dashboard is shared with."""

    __tablename__ = "dashboard_members"
    __table_args__ = (UniqueConstraint("dashboard_id", "user_id", name="uq_member_once"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dashboard_id: Mapped[str] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[DashboardRole] = mapped_column(SAEnum(DashboardRole), default=DashboardRole.VIEWER)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    dashboard: Mapped[Dashboard] = relationship(back_populates="members")
    user: Mapped[User] = relationship()
