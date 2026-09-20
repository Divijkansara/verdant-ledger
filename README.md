# Verdant Ledger

**A digital sustainability ledger for an organisation.**

Activity across eight categories — electricity, water, waste, transportation,
paper, procurement, recycling and renewable energy — is posted as dated,
sourced, auditable entries, priced against published emission factors, and
continuously rolled up into a carbon footprint, resource-consumption totals
and a weighted sustainability score.

---

## The idea

Most carbon tools are a form that prints a number. This is a **ledger**.
Consumption posts as a **charge**; recycling and on-site renewable generation
post as **credits**, because they avoid emissions that would otherwise have
occurred. The organisation's position is the *net* of the two — not one
number that only ever grows.

Three rules the system enforces, borrowed from financial accounting:

1. **Emission factors are data, not code.** Each lives in a database row with
   its citation and a validity window, so factors can be revised each year
   without touching a line of Python.
2. **Every entry snapshots the factor it was priced with.** Revise a factor
   next year and last year's report still reproduces exactly.
3. **The ledger is append-only.** There is no `DELETE` on an entry — the API
   returns `405 Method Not Allowed` deliberately. A mistake is corrected by
   voiding with a reason, which keeps the row and writes an audit record.

---

## Run it in two minutes

```bash
# 1 — backend
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed                # 39 factors + 12 months of demo entries
uvicorn app.main:app --reload     # API + interactive docs at /docs

# 2 — web (second terminal)
cd web
python serve.py                   # opens http://localhost:5500
```

Sign in: `admin@suryanagar.example` / `password123`

**No backend?** Double-click `web/index.html`. Everything runs on the built-in
engine with the same demo ledger and every screen fully working.

---

## What's here

| Folder | What it is |
|---|---|
| **`web/`** | The website and the console. 15 routes, 11 modules, no framework, no build step. Includes the generative colour engine, the tamper-evident ledger, the scenario simulator and the anomaly detector. See `web/README.md`. |
| **`backend/`** | FastAPI + SQLAlchemy REST API. 6 models, 5 routers, 3 service modules, 47 passing tests, auto-generated OpenAPI docs. See `backend/README.md`. |
| **`wireframes.html`** | The low-fidelity UI/UX specification: site map, user flows, annotated screen wireframes, component inventory, state matrix, accessibility checklist. Open in a browser, Ctrl-P to PDF. |
| **`backend/docs/`** | API reference and the ER diagram with a normalisation write-up. |

---

## The three things that make it not a dashboard

**1 · A generative colour system.** No hard-coded colours anywhere. Eight seed
values generate every surface, ink, border, accent, semantic state and chart
hue by perceptual colour maths in OKLCH, with every text/background pair
contrast-solved in code. 648 hue/mode/chroma/loudness combinations were tested
against every WCAG gate — all 648 pass, and 40 randomly generated themes were
driven through a real browser without a single gate failing. The Theme Lab in Settings lets anyone move the
accent hue to any value and watch the whole product re-harmonise, with a live
audit showing the real ratios.

**2 · A tamper-evident ledger.** Each entry is hashed with the hash of the
entry before it. The Integrity screen has a button that deliberately alters a
historical quantity so you can watch the verifier walk 303 blocks and name the
exact row that was changed. SHA-256 is implemented from FIPS 180-4 and verified
byte-for-byte against Node's crypto module.

**3 · A scenario simulator.** Eight intervention levers that rewrite a copy of
the ledger and re-run the production scoring engine — no estimates, no fudge
factors. The 1.5 °C playbook moves the grade from B to A+ with a 71% cut, and
the waterfall shows which lever did what, including the overlap between levers.

---

## The sustainability score

A tonnage cannot say whether an organisation is doing well — a 500-person
company emitting 200 t is doing better than a 50-person company emitting
150 t. Every sub-score is therefore an intensity or a ratio, normalised
between a good-practice **target** (scores 100) and a poor-practice
**ceiling** (scores 0):

```
score(x) = 100 × clamp01( (x − ceiling) ÷ (target − ceiling) )
```

| Sub-score | Indicator | Target | Ceiling | Weight |
|---|---|---|---|---|
| Carbon intensity | net kg CO₂e / employee / month | 40 | 300 | **30%** |
| Renewable electricity | % of kWh from renewables | 60% | 0% | **20%** |
| Waste diversion | % kept out of landfill | 75% | 0% | **20%** |
| Resource efficiency | water + paper per employee / month | — | — | **15%** |
| Low-carbon mobility | % of km by metro, bus, EV, two-wheeler | 55% | 0% | **15%** |

Grades: A+ ≥ 85 · A ≥ 75 · B+ ≥ 65 · B ≥ 55 · C+ ≥ 45 · C ≥ 35 · else D.

The weights live in exactly one place per codebase
(`backend/app/services/scoring.py`, `web/js/data.js`) and a test asserts
they sum to 1.0.

---

## Emission factors

39 factors, every one carrying its source:

- **DEFRA/BEIS 2024 UK Government GHG Conversion Factors** — water supply and
  treatment, waste treatment, transport modes, paper, materials recycling.
- **CEA CO₂ Baseline Database for the Indian Power Sector v20** — grid
  electricity at 0.716 kg CO₂e/kWh, and therefore the avoided-emissions value
  of on-site solar.
- **Spend-based EEIO screening factors** — procurement, per ₹1,000 of spend.
  Screening-grade, and labelled as such in the interface.

Activities are classified by **GHG Protocol scope**: Scope 1 (fuel burnt
directly), Scope 2 (purchased electricity), Scope 3 (upstream and
downstream).

---

## Tech

**Frontend** — HTML5, CSS custom properties, vanilla ES2020. Nine hand-drawn
SVG chart types, no charting library. An OKLCH colour engine that generates the
entire palette from eight seeds and contrast-solves every pair in code. SHA-256
implemented from the spec. Runs from a double-click or a static server.

**Backend** — Python 3.11, FastAPI, SQLAlchemy 2.0 ORM, Pydantic v2, SQLite
(PostgreSQL-ready by changing one environment variable), JWT auth with bcrypt
password hashing, role-based access control, pytest.

```bash
cd backend && pytest -q        # 47 tests
```
