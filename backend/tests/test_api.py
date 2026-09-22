"""Integration tests: the API exercised end to end against a temporary
SQLite database, using FastAPI's dependency override so no test ever
touches the development database.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.seed import seed_factors

TEST_URL = "sqlite:///./test_verdant.db"
engine = create_engine(TEST_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestSession() as db:
        seed_factors(db)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="module")
def auth(client):
    """Register an organisation and return an Authorization header."""
    response = client.post("/api/auth/register", json={
        "org_name": "Test Corp", "headcount": 100, "sector": "Testing",
        "name": "Tester", "email": "tester@test.example", "password": "supersecret1",
    })
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# ───────────────────────────── auth ──────────────────────────────────


def test_health_is_open(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_protected_route_rejects_anonymous(client):
    assert client.get("/api/entries").status_code == 401


def test_duplicate_registration_conflicts(client, auth):
    again = client.post("/api/auth/register", json={
        "org_name": "Other", "headcount": 5, "name": "Xavier",
        "email": "tester@test.example", "password": "supersecret1",
    })
    assert again.status_code == 409


def test_login_with_wrong_password_fails(client, auth):
    r = client.post("/api/auth/login", json={"email": "tester@test.example", "password": "wrong"})
    assert r.status_code == 401


# ──────────────────────────── factors ────────────────────────────────


def test_factor_catalogue_is_seeded(client, auth):
    factors = client.get("/api/factors", headers=auth).json()
    assert len(factors) >= 38
    grid = next(f for f in factors if f["activity_code"] == "grid")
    assert grid["factor_value"] == 0.716
    assert grid["scope"] == 2
    assert grid["source"]          # every factor must cite a source


def test_credits_are_flagged(client, auth):
    factors = client.get("/api/factors?category=recycling", headers=auth).json()
    assert all(f["is_credit"] for f in factors)


# ───────────────────────────── entries ───────────────────────────────


def factor_id(client, auth, code: str) -> int:
    factors = client.get("/api/factors", headers=auth).json()
    return next(f for f in factors if f["activity_code"] == code)["id"]


def test_preview_does_not_persist(client, auth):
    fid = factor_id(client, auth, "grid")
    before = client.get("/api/entries", headers=auth).json()["meta"]["total"]
    preview = client.post("/api/entries/preview", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": 1000,
    }).json()
    assert preview["co2e_kg"] == pytest.approx(716.0)
    after = client.get("/api/entries", headers=auth).json()["meta"]["total"]
    assert before == after


def test_post_entry_computes_and_snapshots(client, auth):
    fid = factor_id(client, auth, "grid")
    r = client.post("/api/entries", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": 2000,
        "reference": "Meter A-14",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["co2e_kg"] == pytest.approx(1432.0)
    assert body["factor_value_snapshot"] == 0.716
    assert body["scope_snapshot"] == 2
    assert body["status"] == "posted"


def test_recycling_entry_is_a_credit(client, auth):
    fid = factor_id(client, auth, "aluminium")
    body = client.post("/api/entries", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": 10,
    }).json()
    assert body["co2e_kg"] == pytest.approx(-89.0)


def test_future_dates_are_rejected(client, auth):
    fid = factor_id(client, auth, "grid")
    r = client.post("/api/entries", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today() + timedelta(days=1)), "quantity": 10,
    })
    assert r.status_code == 422


def test_negative_quantity_is_rejected(client, auth):
    fid = factor_id(client, auth, "grid")
    r = client.post("/api/entries", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": -5,
    })
    assert r.status_code == 422


def test_unknown_factor_is_404(client, auth):
    r = client.post("/api/entries", headers=auth, json={
        "factor_id": 999_999, "activity_date": str(date.today()), "quantity": 5,
    })
    assert r.status_code == 404


def test_there_is_no_delete_on_the_ledger(client, auth):
    entries = client.get("/api/entries", headers=auth).json()["items"]
    r = client.delete(f"/api/entries/{entries[0]['id']}", headers=auth)
    assert r.status_code == 405   # Method Not Allowed — by design


def test_void_removes_an_entry_from_the_totals(client, auth):
    fid = factor_id(client, auth, "dg_set")
    created = client.post("/api/entries", headers=auth, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": 100,
    }).json()

    before = client.get("/api/dashboard/summary?months=1", headers=auth).json()["gross_kg"]
    voided = client.post(f"/api/entries/{created['id']}/void", headers=auth,
                         json={"reason": "Duplicate of invoice 4471"}).json()
    assert voided["status"] == "voided"

    after = client.get("/api/dashboard/summary?months=1", headers=auth).json()["gross_kg"]
    assert after == pytest.approx(before - 85.0)

    # ...but the row is still there for the auditor
    still_listed = client.get("/api/entries?status=voided", headers=auth).json()
    assert still_listed["meta"]["total"] >= 1


def test_double_void_conflicts(client, auth):
    voided = client.get("/api/entries?status=voided", headers=auth).json()["items"][0]
    r = client.post(f"/api/entries/{voided['id']}/void", headers=auth, json={"reason": "again"})
    assert r.status_code == 409


def test_filter_and_pagination(client, auth):
    page = client.get("/api/entries?category=electricity&page=1&page_size=2", headers=auth).json()
    assert len(page["items"]) <= 2
    assert page["meta"]["page"] == 1
    assert all(i["category"] == "electricity" for i in page["items"])


# ──────────────────────────── dashboard ──────────────────────────────


def test_summary_shape(client, auth):
    body = client.get("/api/dashboard/summary?months=6", headers=auth).json()
    for key in ("gross_kg", "avoided_kg", "net_kg", "by_scope", "resources", "score"):
        assert key in body
    assert body["net_kg"] == pytest.approx(body["gross_kg"] - body["avoided_kg"])
    assert 0 <= body["score"]["composite"] <= 100


def test_trend_is_zero_filled_and_ordered(client, auth):
    series = client.get("/api/dashboard/trend?months=12", headers=auth).json()
    assert len(series) == 12
    assert series == sorted(series, key=lambda p: p["month"])
    for point in series:
        assert point["net_kg"] == pytest.approx(point["gross_kg"] - point["avoided_kg"])


def test_category_shares_are_consistent(client, auth):
    rows = client.get("/api/dashboard/by-category?months=12", headers=auth).json()
    positive = [r for r in rows if r["co2e_kg"] > 0]
    assert sum(r["share_pct"] for r in positive) == pytest.approx(100.0, abs=0.5)


def test_insights_are_generated(client, auth):
    insights = client.get("/api/dashboard/insights?months=6", headers=auth).json()
    assert insights
    assert all({"key", "title", "detail", "severity"} <= set(i) for i in insights)


def test_csv_export_has_a_header_row(client, auth):
    r = client.get("/api/reports/entries.csv", headers=auth)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.text.splitlines()[0].startswith("entry_id,activity_date,category")


# ─────────────────────── authorisation rules ─────────────────────────


def test_viewer_cannot_post_entries(client, auth):
    """Role enforcement: a read-only account is refused at the route."""
    from app.models import Role, User

    with TestSession() as db:
        viewer = User(org_id=1, name="Read Only", email="viewer@test.example",
                      password_hash="$2b$12$" + "x" * 53, role=Role.VIEWER)
        db.add(viewer)
        db.commit()
        from app.security import create_access_token
        token, _ = create_access_token(viewer)

    headers = {"Authorization": f"Bearer {token}"}
    fid = factor_id(client, auth, "grid")
    r = client.post("/api/entries", headers=headers, json={
        "factor_id": fid, "activity_date": str(date.today()), "quantity": 1,
    })
    assert r.status_code == 403

    # ...but reading is fine
    assert client.get("/api/dashboard/summary", headers=headers).status_code == 200


# ───────────────────────────── site activity ─────────────────────────

def test_events_are_stored_and_readable_by_admin(client, auth):
    r = client.post("/api/events", json={"session_id": "test-session", "events": [
        {"kind": "view", "path": "#/"}, {"kind": "click", "path": "#/", "detail": {"id": "planetAct"}}]})
    assert r.status_code == 202 and r.json()["stored"] == 2
    r = client.get("/api/events", headers=auth)
    assert r.status_code == 200
    assert r.json()["counts"]["click"] >= 1


def test_event_batches_are_bounded(client):
    r = client.post("/api/events", json={"session_id": "test-session",
                                         "events": [{"kind": "view"}] * 51})
    assert r.status_code == 422
    assert client.get("/api/events").status_code == 401
