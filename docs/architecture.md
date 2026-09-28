# OSHA Industry Benchmark — Technical Architecture

**Version:** 0.2 (backend implemented)
**Date:** September 2026
**Author:** Jesús Martínez
**Status:** Data, ingestion and API built; frontend results screen next

---

## 1. Purpose

This document defines the system architecture before any code is written. It serves three goals:

1. Clarify what gets built and in what order
2. Support the technical decisions I'll present in the capstone defense
3. Make sure the project can grow after the bootcamp without being rebuilt

This is a living document, not a closed one. It gets updated as real problems surface in the data.

---

## 2. System summary

**Core promise:** an EHS manager calculates their plant's injury rate and sees, on a single screen, where it falls against every other plant in their industry, using public OSHA data.

**User flow:** four fields in, one verdict out.

This is a read-only system. Data enters once through a manual, deliberate ingestion process — not through user activity. That single fact distinguishes it from a conventional CRUD app and drives nearly every architectural decision below.

---

## 3. High-level view

```
┌──────────────────────────────────────────────────────────┐
│  OUTSIDE THE SYSTEM                                      │
│  osha.gov/itadata  →  300A CSV (~385k rows / year)       │
└────────────────────────┬─────────────────────────────────┘
                         │ manual download
                         ▼
              ┌──────────────────────┐
              │  data/raw/*.csv      │  (outside Git)
              └──────────┬───────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  BACKEND — Django                        localhost:8000  │
│                                                          │
│  ┌────────────────┐   ┌──────────────┐  ┌─────────────┐  │
│  │  ingest/       │──▶│  core/       │─▶│  api/       │  │
│  │  mgmt command  │   │  ORM models  │  │  DRF views  │  │
│  └────────────────┘   └──────┬───────┘  └──────┬──────┘  │
│                              │                 │         │
│                       ┌──────▼─────────────────▼──────┐  │
│                       │       PostgreSQL              │  │
│                       │  tables + materialized view   │  │
│                       └───────────────────────────────┘  │
└────────────────────────┬─────────────────────────────────┘
                         │ JSON over HTTP
                         ▼
┌──────────────────────────────────────────────────────────┐
│  FRONTEND — React + Vite                 localhost:5173  │
│                                                          │
│   BenchmarkForm  →  api client  →  ResultPanel           │
│                                    Histogram (Recharts)  │
└──────────────────────────────────────────────────────────┘
```

**Governing rule:** all aggregation happens in SQL. The frontend never receives establishment rows, only computed results.

---

## 4. Layers

### 4.1 Ingestion

A Django management command, not a loose script. It lives inside the project and shares the same models and database configuration.

```bash
cd backend
python manage.py load_ita --file ../data/raw/ita_300a_2025.csv            # load 2025
python manage.py load_ita --file ../data/raw/ita_300a_2025.csv --dry-run  # report only
```

Code: `ingest/cleaning.py` (pure pandas, unit-tested) and `ingest/management/commands/load_ita.py`.

Responsibilities:
- Read the CSV with pandas and set aside malformed rows (D-001)
- Derive recordable cases, hours per employee and the 2022 NAICS code (D-006)
- Apply the drop rules in a fixed order, labelling each dropped row with the first rule it fails
- Print the quality report (rows accepted, dropped by reason, split by owner type)
- Replace that year's rows in `establishment_summary` and upsert `naics_reference`, all in one transaction
- Refresh the `cohort_stats` materialized view

**Idempotency:** a unique constraint on `(establishment_id, year)`, and each run *replaces the whole year* instead of upserting (D-002). Upserting never deletes, so rows dropped by a newly tightened rule would stay behind. Replacing the year keeps the table identical to what the current rules accept, which is what makes iterating on cleaning rules safe. Loading 327k rows takes about 45 seconds.

**Quality report:** printed on every run; the 2025 numbers are in `docs/decisions.md`.

### 4.2 Data model

Three objects in `core/models.py`. No star schema, because none is needed: one fact, one catalog, one precomputed view.

**`establishment_summary`** — one row per establishment per year

| Field | Type | Source |
|---|---|---|
| `id` | bigserial PK | generated |
| `year` | smallint | CSV `year_filing_for` |
| `establishment_id` | varchar(20) | CSV |
| `establishment_name`, `company_name`, `city` | varchar | CSV |
| `state` | char(2) | CSV |
| `naics_code` | varchar(6) | 2022 code used for cohorts (D-006) |
| `naics_code_reported` | varchar(6) | CSV, as filed |
| `naics_year`, `industry_description` | | CSV |
| `establishment_type` | smallint | CSV: 1 private, 2 state gov, 3 local gov (D-007) |
| `annual_average_employees` | int | CSV |
| `total_hours_worked` | bigint | CSV |
| `total_deaths`, `total_dafw_cases`, `total_djtr_cases`, `total_other_cases` | int | CSV cols G–J |
| `total_dafw_days`, `total_djtr_days` | int | CSV cols K–L |
| `recordable_cases` | int | G + H + I + J |
| `trir`, `dart` | numeric(8,2) | computed at ingestion |

Constraint: unique `(establishment_id, year)`. Index: `(year, naics_code varchar_pattern_ops, trir)`, which serves `LIKE '3327%'` prefix lookups and the TRIR comparisons in one index.

**Decision:** TRIR is computed and stored during ingestion, not per request. Both the stored rates and the user's rate go through the same function (`core.rules.incidence_rate`, half-up to 2 decimals), so ties are exact.

**`naics_reference`** — code catalog for the industry search

| Field | Type |
|---|---|
| `code` | varchar(6) PK, 2022 code |
| `label` | most common description plants report for the code |

**`cohort_stats`** — materialized view (migration `core/0002`), one row per peer group

| Field | Description |
|---|---|
| `year` | year |
| `ownership` | `private`, `government` or `all` (D-007) |
| `level` | 6, 4 or 3 NAICS digits (D-009) |
| `naics_prefix` | the code prefix at that level |
| `establishment_count` | number of plants |
| `p25_trir`, `median_trir`, `p75_trir`, `p90_trir` | cohort percentiles |
| `share_zero` | share of plants with TRIR 0 |
| `pooled_trir` | Σ cases × 200,000 ÷ Σ hours (BLS-style industry rate) |

Everything that is the same for every user is precomputed here. What depends on the user's TRIR (exact rank, histogram range) is counted at request time over the index, touching one cohort at most (D-005).

### 4.3 Data quality rules

All thresholds are in `backend/core/rules.py`, shared by ingestion and form validation. Full justification with numbers: `docs/decisions.md`.

| Rule | Threshold | Decision |
|---|---|---|
| Drop malformed CSV rows | — | D-001 |
| Drop hours worked ≤ 0 or employees ≤ 0 | — | division by zero |
| Drop invalid NAICS | not a real sector, or 5th digit 0 | D-008 |
| Drop missing establishment type | not 1/2/3 | D-007 |
| Drop small plants | < 10,000 hours | D-003 |
| Drop implausible hours per employee | outside 250–8,760 | D-004 |
| Drop cases > average employees | — | D-008 |
| Minimum plants per cohort | 30 | D-009 |

**Cohort fallback:** if the 6-digit NAICS cohort has fewer than 30 plants in the chosen ownership group, roll up to 4 digits, then 3. If that still fails, return the TRIR without a percentile. The response always states which level was used.

### 4.4 API

Django REST Framework. Full contract: `docs/api-contract.md`.

```
POST /api/benchmark/          → TRIR + percentile + cohort stats + histogram
GET  /api/industries/?q=      → NAICS catalog for autocomplete
GET  /api/health/             → liveness check
```

- The benchmark endpoint **writes nothing**. It validates the numbers, reads `cohort_stats`, counts the rank and histogram, and responds.
- `ownership` (`private` default, `government`, `all`) picks the peer group before any statistic is computed.
- No authentication in the MVP; anonymous throttling at 120 requests per minute.
- No pagination (no long lists are ever returned).

### 4.5 Frontend

React + Vite. A single route.

```
src/
├── api/client.js           fetch + error handling
├── components/
│   ├── BenchmarkForm.jsx   4 fields + validation
│   ├── ResultPanel.jsx     large TRIR + verdict
│   └── Histogram.jsx       Recharts + ReferenceLine
├── App.jsx
└── main.jsx
```

State via `useState`. Redux and Context are unnecessary for one screen.

The `Histogram` component receives pre-bucketed data and renders a `BarChart` with a vertical `ReferenceLine` at the user's TRIR. That's the whole component.

---

## 5. Why this scales

Simple today, but every future extension already has a place to land:

| Future extension | Where it plugs in | What stays untouched |
|---|---|---|
| User accounts | `accounts/` app, Django user model | nothing breaks, DRF is ready |
| Saved benchmarks | new table with FK to user | the calculation is unchanged |
| CSV upload | new endpoint reusing the calculation logic | the form keeps working |
| Explorer screen | new React route + paginated endpoint | the current screen is untouched |
| Case Detail (300/301) | new table with FK to establishment | 300A data stays intact |
| More years | same command with a different `--year` | already modeled |
| Scheduled refresh | GitHub Action calling the management command | the command already exists |

Three decisions make this possible: ingestion as a management command rather than a loose script, aggregation in SQL rather than in the client, and year as a column rather than a table per year.

---

## 6. Repository structure

```
osha-benchmark/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   ├── data-dictionary.md
│   └── decisions.md          ← cleaning decision log
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/               settings, urls
│   ├── core/                 models, migrations, rules, NAICS crosswalk
│   ├── ingest/               cleaning pipeline, load_ita command
│   └── api/                  serializers, views
├── frontend/
│   ├── package.json
│   └── src/
├── analysis/
│   ├── 01_profiling.ipynb
│   ├── 02_cleaning_rules.ipynb
│   └── 03_findings.ipynb
├── data/
│   └── raw/                  ← gitignored
└── .gitignore
```

`docs/decisions.md` is the highest-value file for interviews. Every time a data decision gets made, record what was decided, what the alternatives were, and why.

---

## 7. Trello backlog

Suggested lists: **Backlog · Doing · Review · Done**, with labels by layer (`data`, `backend`, `frontend`, `docs`).

### Phase 0 — Exploration
- [x] Download the most recent 300A CSV
- [x] Profiling notebook: shape, nulls, describe, hours distribution
- [x] Count establishments per NAICS at 6 and 4 digits
- [x] Set cleaning thresholds and record them in `decisions.md`
- [x] Choose the year for the MVP

### Phase 1 — Foundation
- [x] Repo, `.gitignore`, folder structure
- [x] Django + DRF + PostgreSQL running locally
- [x] Models and first migration
- [x] React + Vite booting
- [x] CORS configured, test request from React to Django

### Phase 2 — Data
- [x] `load_ita` management command, minimal version
- [x] Validation and drop rules
- [x] Idempotency via unique constraint
- [x] Quality report on command exit
- [x] NAICS catalog loaded
- [x] `cohort_stats` materialized view

### Phase 3 — API
- [x] Input serializer with validation
- [x] TRIR and percentile calculation
- [x] Cohort fallback logic
- [x] Histogram data in the same response
- [x] Handling for all four error cases
- [x] NAICS catalog endpoint

### Phase 4 — Frontend
- [x] Four-field form with validation
- [ ] API client with loading and error states
- [ ] Result panel
- [ ] Histogram with reference line
- [ ] Empty states and visible error messages

### Phase 5 — Analysis
- [ ] Findings notebook, three minimum
- [ ] One-page written summary
- [ ] Supporting charts

### Phase 6 — Wrap-up
- [ ] README with architecture diagram
- [ ] Data dictionary
- [ ] Dataset limitations section
- [ ] `decisions.md` complete
- [ ] Deploy (if time allows)
- [ ] Three-minute recorded demo

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cleaning takes longer than planned | High | Phase 0 before any backend work; if the CSV looks unmanageable after two hours, reassess |
| 6-digit cohorts too small | High | 4-digit fallback already designed in |
| Django learning curve eats time | Medium | No authentication in the MVP, which is the hard part |
| Deployment consumes the final week | Medium | Deploy is "Should ship", not "Must ship" |
| Scope creep toward accounts and explorer | High | Cut line documented and enforced |

---

## 9. Out of scope

User accounts, CSV upload, explorer screen, Case Detail data, NLP on incident narratives, PDF export, automated orchestration, BLS SOII comparison.

All of it is accounted for in the design and has a place to land, but none of it gets built in this version.

**Cut line:** nothing that stores user state, nothing that adds a second screen.

**Exception:** the analysis notebook is never cut, under any circumstances.
