# Entity-Relationship Diagram

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : "employs"
    ORGANIZATIONS ||--o{ LEDGER_ENTRIES : "reports"
    ORGANIZATIONS ||--o{ TARGETS : "commits to"
    ORGANIZATIONS ||--o{ SCORE_SNAPSHOTS : "is scored in"
    ORGANIZATIONS ||--o{ AUDIT_LOGS : "records"
    USERS         ||--o{ LEDGER_ENTRIES : "posts"
    USERS         ||--o{ AUDIT_LOGS : "acts in"
    EMISSION_FACTORS ||--o{ LEDGER_ENTRIES : "prices"

    ORGANIZATIONS {
        int     id PK
        string  name
        string  sector
        string  country
        int     headcount "divisor for every intensity metric"
        int     reporting_year_start_month "4 = Indian FY"
        datetime created_at
    }

    USERS {
        int      id PK
        int      org_id FK
        string   name
        string   email UK
        string   password_hash "bcrypt"
        enum     role "admin | contributor | viewer"
        bool     is_active
        datetime created_at
    }

    EMISSION_FACTORS {
        int     id PK
        enum    category "8 activity categories"
        string  activity_code "unique per category+version"
        string  label
        string  unit "kWh | kL | kg | km | sheets | INR_000"
        float   factor_value "kg CO2e per unit; negative = credit"
        int     scope "GHG Protocol 1 | 2 | 3"
        string  source "citation - never blank"
        enum    resource_kind "energy | water | waste | paper | distance | spend"
        float   resource_per_unit "e.g. 1 ream -> 2.5 kg paper"
        bool    is_renewable "counts to renewable share"
        bool    is_diverted "counts to waste diversion"
        bool    is_low_carbon "counts to mobility share"
        date    valid_from
        date    valid_to "NULL = current"
        bool    is_active
    }

    LEDGER_ENTRIES {
        int      id PK
        int      org_id FK
        int      factor_id FK
        int      created_by_id FK
        date     activity_date
        float    quantity
        string   reference "invoice, meter reading, department"
        float    factor_value_snapshot "immutable - restatement control"
        string   unit_snapshot
        int      scope_snapshot
        float    co2e_kg "quantity x factor, stored"
        enum     status "posted | voided"
        string   void_reason
        datetime voided_at
        datetime created_at
    }

    TARGETS {
        int    id PK
        int    org_id FK
        string metric "carbon_per_employee | renewable_share | ..."
        float  target_value
        date   target_date
        string note
    }

    SCORE_SNAPSHOTS {
        int    id PK
        int    org_id FK
        date   period_start
        date   period_end
        float  composite
        string grade "A+ .. D"
        json   subscores
    }

    AUDIT_LOGS {
        int      id PK
        int      org_id FK
        int      user_id FK
        string   action "entry.create | entry.void | factor.update"
        string   entity
        int      entity_id
        json     detail
        datetime created_at
    }
```

## Relationship notes

| Relationship | Cardinality | Why |
|---|---|---|
| Organization → Users | 1 : N | multi-tenant; one login belongs to exactly one organisation |
| Organization → Ledger entries | 1 : N | every posting belongs to one reporting entity |
| Emission factor → Ledger entries | 1 : N | one factor prices many postings |
| User → Ledger entries | 1 : N | attribution — who posted it |

## Normalisation

The schema is in **3NF**:

* **1NF** — every column is atomic; no repeating groups (a month's entries are
  N rows, not a column per day).
* **2NF** — no partial dependency; every table has a single-column surrogate
  key, and all attributes depend on that whole key.
* **3NF** — no transitive dependency. A factor's `label`, `unit` and `source`
  live in `emission_factors`, not repeated on every entry that uses it.

**The one deliberate denormalisation**: `ledger_entries` duplicates
`factor_value`, `unit` and `scope` from `emission_factors` as `*_snapshot`
columns. This is not redundancy by accident — it is a *temporal* requirement.
A factor is a value that changes over time; an entry must keep the value that
was in force when it was posted, or every historical report silently changes
the next time a factor is revised. `co2e_kg` is stored for the same reason and
for query speed: aggregating a stored column is far cheaper than recomputing a
join-and-multiply across a hundred thousand rows on every dashboard load.

## Indexes

| Index | Columns | Serves |
|---|---|---|
| `ix_entry_org_date` | `org_id, activity_date` | every dashboard query (period filter) |
| `ix_entry_org_status` | `org_id, status` | excluding voided entries from totals |
| `ix_factor_lookup` | `category, is_active` | the activity picker on the Log screen |
| `uq_users_email` | `email` | login, and enforcing one account per address |
| `uq_factor_version` | `category, activity_code, valid_from` | prevents two live versions of the same factor |
