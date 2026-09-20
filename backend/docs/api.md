# API reference

Base URL: `http://127.0.0.1:8000`
All request and response bodies are JSON. All authenticated requests carry
`Authorization: Bearer <token>`.

A live, executable version of this document is generated from the code at
**`/docs`** (Swagger UI) and **`/redoc`**.

---

## Conventions

| Status | Meaning in this API |
|---|---|
| `200` | OK |
| `201` | Created (register, post entry, create factor) |
| `204` | No content (factor retired) |
| `401` | Missing, malformed or expired token |
| `403` | Authenticated, but the role is not permitted |
| `404` | Not found, or belongs to another organisation |
| `405` | Method not allowed — used deliberately for `DELETE /api/entries/{id}` |
| `409` | Conflict (duplicate email, entry already voided) |
| `422` | Validation failed — the body names the offending field |

Errors always return `{"detail": "..."}`.

---

## Auth

### `POST /api/auth/register`
Creates an organisation and its first user, who becomes the **admin**.

```json
{
  "org_name": "Suryanagar Technologies Pvt Ltd",
  "headcount": 120,
  "sector": "Information technology services",
  "name": "Divij Rao",
  "email": "admin@suryanagar.example",
  "password": "password123"
}
```
→ `201` with `{ access_token, token_type, expires_in, user }`

### `POST /api/auth/login`
`{ "email": "...", "password": "..." }` → the same token payload.

### `GET /api/auth/me`
Current user: `{ id, name, email, role, org_id }`

### `GET /api/auth/organization` · `PATCH /api/auth/organization` *(admin)*
Read or update the org profile. **Headcount matters** — every intensity
metric and therefore the whole score divides by it.

---

## Emission factors

### `GET /api/factors`
Query: `category`, `active_only` (default `true`), `on_date`.

```json
[{
  "id": 1, "category": "electricity", "activity_code": "grid",
  "label": "Grid electricity", "unit": "kWh",
  "factor_value": 0.716, "scope": 2,
  "source": "Central Electricity Authority, CO2 Baseline Database ... v20",
  "resource_kind": "energy_kwh",
  "is_renewable": false, "is_diverted": false, "is_low_carbon": false,
  "is_credit": false, "valid_from": "2024-04-01", "valid_to": null
}]
```

### `POST /api/factors` *(admin)* · `PATCH /api/factors/{id}` *(admin)*
Add or revise a factor. **Revising does not restate past entries** — each
entry keeps the value it was priced with. New postings use the new value.

### `DELETE /api/factors/{id}` *(admin)* → `204`
**Retires** the factor (`is_active = false`, `valid_to = today`). The row is
never removed, because entries reference it.

---

## Ledger entries

### `POST /api/entries/preview`
Prices an activity **without saving it** — this is what powers the live
"computed impact" line on the Log Activity screen. Same body as a create.

```json
{ "factor_id": 1, "activity_date": "2026-09-01", "quantity": 1500 }
```
```json
{ "factor_id": 1, "label": "Grid electricity", "quantity": 1500,
  "unit": "kWh", "factor_value": 0.716, "co2e_kg": 1074.0,
  "scope": 2, "is_credit": false }
```

Because the preview and the real posting call the same engine, the number the
user sees before submitting is always the number that gets stored.

### `POST /api/entries` *(admin, contributor)* → `201`

```json
{ "factor_id": 1, "activity_date": "2026-09-04",
  "quantity": 17800, "reference": "TNEB meter reading" }
```

Validation: `quantity > 0`, `activity_date` not in the future, factor must
exist and be active.

### `GET /api/entries`
Filters: `category`, `date_from`, `date_to`, `scope`, `status`, `q` (searches
the activity label and the reference text).
Paging: `page`, `page_size` (max 500).
Sorting: `sort` ∈ `activity_date | co2e_kg | created_at`, prefix `-` for
descending. Default `-activity_date`.

```json
{
  "items": [ { "id": 42, "activity_date": "2026-09-04", "category": "electricity",
               "activity_label": "Grid electricity", "quantity": 17800,
               "unit_snapshot": "kWh", "factor_value_snapshot": 0.716,
               "co2e_kg": 12744.8, "scope_snapshot": 2,
               "reference": "TNEB meter reading", "status": "posted" } ],
  "meta":  { "total": 308, "page": 1, "page_size": 50, "pages": 7 },
  "totals": { "net_kg": 101320.18 }
}
```

`totals` covers the **whole filtered set**, not just the page on screen.

### `PATCH /api/entries/{id}` *(writer)*
Only `reference` is editable. The numbers are immutable by design.

### `POST /api/entries/{id}/void` *(writer)*
```json
{ "reason": "Duplicate of invoice 4471" }
```
Marks the entry `voided`, records the reason and timestamp, writes an audit
row. Voided entries are excluded from every aggregate but remain listable
with `?status=voided`.

### `DELETE /api/entries/{id}` → `405 Method Not Allowed`
Not implemented, on purpose. A ledger that can be silently deleted from is
not an audit trail.

---

## Dashboard

### `GET /api/dashboard/summary?months=6`
**One call that fills the whole top of the dashboard** — deliberately not six
endpoints the frontend has to stitch together.

```json
{
  "organization": { "name": "...", "headcount": 120 },
  "period_start": "2026-04-01", "period_end": "2026-09-11", "months": 6,
  "gross_kg": 121026.86, "avoided_kg": 19706.68, "net_kg": 101320.18,
  "net_per_employee_month": 140.72,
  "by_scope": { "scope_1": 5194.65, "scope_2": 53951.79, "scope_3": 42173.74 },
  "resources": { "energy_kwh": 106265.48, "renewable_kwh": 15744.35,
                 "water_kl": 2561.51, "waste_kg": 13321.8, "diverted_kg": 8072.7,
                 "paper_kg": 1705.05, "distance_km": 177589.13,
                 "low_carbon_km": 99994.04, "spend_inr_000": 8112.61 },
  "renewable_share_pct": 14.82,
  "diversion_rate_pct": 60.6,
  "low_carbon_share_pct": 56.31,
  "score": { "composite": 57.44, "grade": "B", "subscores": [ ... ] }
}
```

### `GET /api/dashboard/score?months=6`
The score with all five sub-scores, each carrying its observed value, target,
ceiling, weight and band (`good | warning | critical`) — everything the UI
needs to draw a labelled meter without hardcoding the methodology.

### `GET /api/dashboard/trend?months=12`
Zero-filled, oldest first, so the chart always has a bar per month:

```json
[{ "month": "2025-10", "gross_kg": 21033.4, "avoided_kg": 2609.1, "net_kg": 18424.3 }]
```

### `GET /api/dashboard/by-category?months=6`
Per category: `co2e_kg`, `share_pct`, `entry_count`, sorted largest first.

### `GET /api/dashboard/resources?months=6`
The physical totals only.

### `GET /api/dashboard/insights?months=6`
Rule-based, quantified recommendations:

```json
[{ "key": "renewable_gap", "severity": "warning",
   "title": "Renewable electricity is below the 60% target",
   "detail": "Adding 48,015 kWh ... would avoid about 34.38 t CO2e.",
   "estimated_saving_kg": 34378.7 }]
```

Four rules run: largest emission source, weakest sub-score, renewable gap,
landfill diversion. Each names a number and an action — a dashboard that only
reports is a spreadsheet.

---

## Reports

### `GET /api/reports/entries.csv`
Streamed CSV (`StreamingResponse`, so a large ledger never has to fit in
memory). Optional `date_from`, `date_to`.

### `GET /api/reports/monthly?months=12`
A disclosure-shaped JSON report: period, totals, split by scope and by
category, the month series, resource totals, the score, and the basis of
preparation.

---

## Migrations

Schema creation uses `Base.metadata.create_all()` at startup, which is
appropriate at this scale: it creates missing tables and leaves existing ones
alone. It does **not** alter existing tables, so a production deployment would
add Alembic:

```bash
alembic init migrations
alembic revision --autogenerate -m "add targets table"
alembic upgrade head
```

This is stated rather than hidden — knowing the limitation is the point.
