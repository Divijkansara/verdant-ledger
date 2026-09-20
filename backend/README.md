# Verdant Ledger — Backend API

A digital sustainability ledger for an organisation. Activities across eight
categories are posted as ledger entries, priced against published emission
factors, and rolled up into a carbon footprint, resource-consumption totals
and a weighted sustainability score.

**Stack:** Python 3.11 · FastAPI · SQLAlchemy 2.0 (ORM) · Pydantic v2 ·
SQLite (PostgreSQL-ready) · JWT auth · pytest

---

## 1. The idea in one paragraph

Most "carbon calculators" are a form that prints a number. This is a
**ledger**: every environmental impact is a dated, sourced, auditable posting,
the way a financial ledger records money. Consumption (electricity, water,
waste, transport, paper, procurement) is posted as a **charge**; recycling and
on-site renewable generation are posted as **credits**, because they avoid
emissions that would otherwise have occurred. The organisation's position is
the *net* of the two — not a single number that only ever goes up.

---

## 2. Quick start

```bash
# 1 — dependencies
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2 — configuration
cp .env.example .env               # the defaults work as-is for SQLite

# 3 — create the schema and load data
python -m app.seed                 # 39 emission factors + a 12-month demo ledger

# 4 — run
uvicorn app.main:app --reload
```

Then open **http://127.0.0.1:8000/docs** — FastAPI generates a complete,
interactive API console from the code. Every endpoint can be called from that
page, which makes it the easiest thing to demo live.

Demo logins created by the seed script (all use password `password123`):

| Email | Role | Can do |
|---|---|---|
| `admin@suryanagar.example` | admin | everything, incl. edit emission factors |
| `facilities@suryanagar.example` | contributor | post and void ledger entries |
| `auditor@suryanagar.example` | viewer | read dashboards only |

Run the tests:

```bash
pytest -q          # 47 tests
```

---

## 3. Project structure

```
backend/
├── app/
│   ├── main.py              FastAPI app, CORS, request logging, lifespan
│   ├── config.py            settings from environment (.env)
│   ├── database.py          engine, session factory, get_db dependency
│   ├── models.py            6 ORM models — the database schema
│   ├── schemas.py           Pydantic request/response contracts
│   ├── security.py          bcrypt hashing, JWT, role dependencies
│   ├── seed.py              emission factor catalogue + demo ledger
│   ├── services/            ← the business logic, independent of HTTP
│   │   ├── calculator.py      quantity x factor -> kg CO2e
│   │   ├── scoring.py         the five sub-scores and the composite
│   │   └── analytics.py       SQL aggregations behind the dashboard
│   └── routers/             ← the HTTP layer, thin by design
│       ├── auth.py            register / login / me / organisation
│       ├── factors.py         emission factor catalogue (CRUD)
│       ├── entries.py         post, preview, list, void
│       ├── dashboard.py       summary, score, trend, categories, insights
│       └── reports.py         CSV export, JSON disclosure report
├── tests/                   47 unit + integration tests
├── docs/
│   ├── api.md               endpoint reference
│   └── er-diagram.md        entity-relationship diagram
└── requirements.txt
```

**Layering.** Routers do HTTP: parse, authorise, call a service, serialise.
Services do the domain work and never import FastAPI. That separation is why
the score engine can be unit-tested without starting a server, and why the
same calculation runs for a live preview, a posted entry and a CSV export
without three chances to disagree.

---

## 4. Data model

Six tables. Full diagram in [`docs/er-diagram.md`](docs/er-diagram.md).

| Table | Purpose |
|---|---|
| `organizations` | the reporting entity; `headcount` drives every intensity metric |
| `users` | login, hashed password, one of three roles |
| `emission_factors` | the priced activity catalogue, with source and validity dates |
| `ledger_entries` | the postings: date, quantity, computed kg CO2e |
| `targets` | reduction targets to measure progress against |
| `score_snapshots` | a score frozen for a period, so the score itself can trend |
| `audit_logs` | who changed what, when |

### Three design decisions worth defending

**1 — Emission factors are data, not constants in the code.**
`0.716 kg CO2e/kWh` lives in a database row together with its source (CEA
baseline database) and a validity window. When DEFRA publishes the 2025
factors, an admin updates rows through the API; no redeploy, no code change.
A hardcoded factor would also make the methodology unciteable, which is fatal
for anything that calls itself a disclosure.

**2 — Every entry snapshots the factor it was priced with.**
`ledger_entries` stores `factor_value_snapshot`, `unit_snapshot` and
`scope_snapshot`. If a factor is revised next year, last year's report still
reproduces exactly. This is the accounting principle of *restatement control*
— a report you can no longer reproduce is not evidence.

**3 — The ledger is append-only.**
There is no `DELETE /api/entries/{id}` — that route returns **405 Method Not
Allowed**, deliberately. A wrong entry is corrected with
`POST /api/entries/{id}/void`, which requires a reason, keeps the row, and
writes an audit record. Aggregations exclude voided entries but auditors can
still list them.

---

## 5. The sustainability score

A tonnage alone cannot answer *"is this organisation doing well?"* — a
500-person company emitting 200 t is doing better than a 50-person company
emitting 150 t. So every sub-score is an **intensity or a ratio**, never an
absolute.

Each indicator is normalised between a good-practice **target** (scores 100)
and a poor-practice **ceiling** (scores 0), then clamped:

```
score(x) = 100 × clamp01( (x − ceiling) ÷ (target − ceiling) )
```

| Sub-score | Indicator | Target = 100 | Ceiling = 0 | Weight |
|---|---|---|---|---|
| Carbon intensity | net kg CO2e / employee / month | 40 | 300 | **30%** |
| Renewable electricity | % of kWh from renewables | 60% | 0% | **20%** |
| Waste diversion | % of waste kept from landfill | 75% | 0% | **20%** |
| Resource efficiency | mean of water (0.9→4.0 kL) and paper (0.5→3.0 kg) per employee/month | — | — | **15%** |
| Low-carbon mobility | % of km by metro, bus, EV or two-wheeler | 55% | 0% | **15%** |

```
composite = 0.30·carbon + 0.20·renewable + 0.20·diversion
          + 0.15·resource + 0.15·mobility
```

Grades: A+ ≥ 85, A ≥ 75, B+ ≥ 65, B ≥ 55, C+ ≥ 45, C ≥ 35, else D.
Bands: ≥ 67 good, 40–66 warning, < 40 critical.

The weights are declared once, in `app/services/scoring.py`, and a test
asserts they sum to 1.0 — so the composite can never quietly stop being out
of 100.

---

## 6. Emission factors

39 factors across the eight categories, every one carrying its citation:

* **DEFRA/BEIS UK Government GHG Conversion Factors 2024** — water supply and
  treatment, waste treatment, transport modes, paper, materials recycling.
* **Central Electricity Authority, CO2 Baseline Database for the Indian Power
  Sector v20** — grid electricity at 0.716 kg CO2e/kWh, and therefore also the
  avoided-emissions value of on-site solar.
* **Spend-based EEIO screening factors** — procurement, priced per ₹1,000 of
  spend. These are screening-grade and are labelled as such; supplier-specific
  data should replace them before any real disclosure.

Activities are classified by **GHG Protocol scope**: Scope 1 (fuel burnt
directly — diesel gensets, owned vehicles), Scope 2 (purchased electricity),
Scope 3 (everything upstream and downstream — water, waste, commuting,
flights, procurement).

---

## 7. API reference (summary)

Full detail, with request and response bodies, in
[`docs/api.md`](docs/api.md) and live at `/docs`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | liveness probe |
| `POST` | `/api/auth/register` | — | create organisation + admin user |
| `POST` | `/api/auth/login` | — | exchange credentials for a JWT |
| `GET` | `/api/auth/me` | any | current user |
| `GET`/`PATCH` | `/api/auth/organization` | any / admin | org profile, headcount |
| `GET` | `/api/factors` | any | factor catalogue (filter by category, date) |
| `POST`/`PATCH`/`DELETE` | `/api/factors[/{id}]` | admin | manage factors (delete = retire) |
| `POST` | `/api/entries/preview` | any | price an activity **without saving** |
| `POST` | `/api/entries` | writer | post an entry |
| `GET` | `/api/entries` | any | filter, search, sort, paginate |
| `PATCH` | `/api/entries/{id}` | writer | edit the reference text only |
| `POST` | `/api/entries/{id}/void` | writer | reverse an entry, with a reason |
| `GET` | `/api/dashboard/summary` | any | **one call that fills the dashboard** |
| `GET` | `/api/dashboard/score` | any | score + sub-scores |
| `GET` | `/api/dashboard/trend` | any | monthly gross / avoided / net, zero-filled |
| `GET` | `/api/dashboard/by-category` | any | emissions split by category |
| `GET` | `/api/dashboard/resources` | any | kWh, kL, kg, km totals |
| `GET` | `/api/dashboard/insights` | any | quantified recommendations |
| `GET` | `/api/reports/entries.csv` | any | streamed CSV export |
| `GET` | `/api/reports/monthly` | any | JSON disclosure report |

### Example session

```bash
BASE=http://127.0.0.1:8000

TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@suryanagar.example","password":"password123"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# what would 1,500 kWh of grid electricity cost us?
curl -s -X POST $BASE/api/entries/preview -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"factor_id":1,"activity_date":"2026-09-01","quantity":1500}'
# -> {"co2e_kg":1074.0,"scope":2,"is_credit":false, ...}

curl -s "$BASE/api/dashboard/summary?months=6" -H "Authorization: Bearer $TOKEN"
```

---

## 8. Security

* Passwords are **bcrypt** hashes (`passlib`) — never stored or logged in
  plaintext, never reversible.
* Authentication is a **JWT** bearer token carrying only the user id, org id
  and role; everything else is re-read server-side, so an edited token cannot
  grant privilege.
* **Role-based access control** with three roles enforced by a FastAPI
  dependency (`require_role`), not by hiding buttons in the UI.
* **Tenant isolation**: every query filters on `org_id` taken from the token,
  so one organisation can never read another's ledger.
* Login returns the same error for an unknown email and a wrong password, so
  the endpoint cannot be used to enumerate registered accounts.
* All input is validated by Pydantic before it reaches the database; the ORM
  parameterises every query, so SQL injection is not reachable.

---

## 9. Connecting a frontend

The API is frontend-agnostic — it speaks JSON over HTTP, so it works
identically with a React app, a Vue app, or plain HTML with `fetch()`.

```js
const res = await fetch("http://127.0.0.1:8000/api/dashboard/summary?months=6", {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();   // everything the dashboard needs, in one call
```

CORS origins are configured in `.env` (`CORS_ORIGINS`) — the defaults already
allow Vite (5173), Create React App (3000) and VS Code Live Server (5500).

---

## 10. Switching to PostgreSQL

One line in `.env`:

```
DATABASE_URL=postgresql+psycopg://verdant:verdant@localhost:5432/verdant_ledger
```

Install `psycopg[binary]` (already listed, commented, in `requirements.txt`)
and re-run `python -m app.seed --reset`. Nothing in the application code
changes; the only dialect-specific SQL in the project — grouping entries by
month — is isolated in one helper in `services/analytics.py`.

---

## 11. Honest limitations

Worth saying out loud rather than being caught on:

* **Schema changes use `create_all`, not migrations.** Fine for a project of
  this size; a production system would add Alembic so existing data survives
  a schema change.
* **Procurement factors are spend-based screening figures.** They are the
  right order of magnitude, not supplier-specific accuracy, and the app labels
  them as such.
* **Commuting is survey-estimated**, as it is in most real Scope 3 reporting.
* **No scheduled score snapshots yet.** The `score_snapshots` table exists and
  the API computes scores on demand; a nightly job to freeze month-end scores
  is the obvious next step.
* **Tokens are not refreshable.** A 12-hour access token, then log in again.
