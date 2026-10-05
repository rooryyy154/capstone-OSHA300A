# PlantLine (OSHA Industry Benchmark) — Technical Architecture

**Version:** 0.4 (MVP built; contact form built, running on test keys)
**Date:** October 2026
**Author:** Jesús Martínez
**Status:** Data, ingestion, API and frontend built. Contact form built; it still needs the real Turnstile keys and an SMTP provider before it can go live.

---

## 1. Purpose

This document started as the plan written before any code existed, and it is kept current as the system is built. It serves three goals:

1. Clarify what gets built and in what order
2. Support the technical decisions I'll present in the capstone defense
3. Make sure the project can grow after the bootcamp without being rebuilt

This is a living document, not a closed one. It gets updated as real problems surface in the data.

---

## 2. System summary

**Core promise:** an EHS manager calculates their plant's injury rate and sees, on a single screen, where it falls against every other plant in their industry, using public OSHA data.

**User flow:** the landing page shows what the year's OSHA data says; from there, four fields in, one verdict out.

The benchmark core is a read-only system. Data enters once through a manual, deliberate ingestion process — not through user activity. That single fact distinguishes it from a conventional CRUD app and drives nearly every architectural decision below.

**One qualified exception:** the contact form is an isolated write path. It is a mailbox, not user state: no accounts, no sessions, nothing a visitor can read back. It lives in its own Django app with its own table and never touches the benchmark tables (section 4.6).

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
│  ┌────────────────┐   ┌──────▼─────────────────▼──────┐  │
│  │  contact/      │──▶│       PostgreSQL              │  │
│  │  mailbox       │   │  tables + materialized view   │  │
│  └───────┬────────┘   └───────────────────────────────┘  │
└──────────┼─────────────────────────────┬─────────────────┘
           │ HTTPS / SMTP                │ JSON over HTTP
           ▼                             ▼
┌────────────────────────┐  ┌──────────────────────────────┐
│  EXTERNAL (contact)    │  │  FRONTEND — React + Vite     │
│  Cloudflare Turnstile  │  │              localhost:5173  │
│    siteverify          │  │                              │
│  SMTP provider         │  │  Landing    findings, charts │
│    Resend or Brevo     │  │  Benchmark  form → results   │
└────────────────────────┘  │  Contact    form → code      │
                            │             Turnstile widget │
                            └──────────────────────────────┘
```

The browser also loads the Turnstile widget straight from Cloudflare; the token it produces is only trusted after Django checks it with `siteverify`.

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

**More years:** one run per file (`data/raw/ita_300a_<year>.csv`). Only 2025 is loaded today. A newly loaded year shows up in the site's year selector with no frontend change (section 4.5). Older OSHA files may use different columns and must be checked against `ingest/cleaning.py` before loading.

### 4.2 Data model

Three objects in `core/models.py`. No star schema, because none is needed: one fact, one catalog, one precomputed view. (The contact feature adds a fourth table in its own app; see 4.6.)

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
| `label` | the official NAICS 2022 title where `core/naics.py` has one (sectors and the industries the landing page highlights); otherwise the most common description plants report for the code |

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
POST /api/benchmark/              → TRIR + percentile + cohort stats + histogram
GET  /api/insights/?year=         → landing-page figures: totals, sectors, plant size, ownership, industries
GET  /api/industries/?q=&year=    → NAICS catalog for autocomplete
GET  /api/years/                  → report years loaded in the database
GET  /api/health/                 → liveness check

POST /api/contact/                → validate captcha + fields, send code        (4.6)
POST /api/contact/verify/         → validate code, forward message to me        (4.6)
```

- The benchmark endpoint **writes nothing**. It validates the numbers, reads `cohort_stats`, counts the rank and histogram, and responds. The same is true of every `GET` endpoint. The only endpoints that write are the two contact endpoints, and they write only to `contact_message`.
- `ownership` (`private` default, `government`, `all`) picks the peer group before any statistic is computed.
- `year` (default: the latest loaded) selects the report year on `benchmark`, `insights` and `industries`.
- `/api/insights/` is cached per year and row count, so a reload with `load_ita` is picked up on the next request.
- Every error is JSON with a status code, never Django's HTML error page (`api/exceptions.py`): a database that is down returns 503, any other unexpected failure 500.
- No authentication in the MVP; anonymous throttling at 120 requests per minute. The contact endpoints have their own, much stricter throttle scopes (4.6).
- No pagination (no long lists are ever returned).
- In development, CORS accepts any `localhost` port, because Vite moves to 5174, 5175… when 5173 is taken.

### 4.5 Frontend

React + Vite, with React Router. Four routes plus a 404 page (`/comments` redirects to `/contact`):

| Route | Page | What it shows |
|---|---|---|
| `/` | Landing | Six findings from the selected year (`/api/insights/`), each with a chart, then a link to the calculator and the methodology |
| `/benchmark` | Benchmark | The four-field form and the result: TRIR, 95% range, verdict, percentile, peer statistics, histogram |
| `/contact` | Contact | The two-step contact form (4.6). It replaced the Comments placeholder: the route was renamed, not added |
| `/credits` | Credits | Data source and stack |

```
src/
├── api/client.js             fetch wrapper, ApiError, one function per endpoint
├── lib/
│   ├── year.jsx, useYear.js  the selected report year (React Context)
│   ├── hooks.js              useApi, useTooltip, useElementWidth, useDebounced
│   ├── errors.js             API failure → status code, title, message
│   └── format.js             number formatting
├── components/
│   ├── layout/               SiteHeader (navigation + year selector), SiteFooter, PageHeader
│   ├── benchmark/            BenchmarkForm, IndustryPicker, ResultPanel, PercentileMeter
│   ├── charts/               Histogram, HBarChart, ColumnChart, RangeStrip, Tooltip, DataTable
│   ├── states/               Loader, StatusMessage, PageAlert
│   └── contact/              ContactForm
├── pages/                    Landing, Benchmark, Contact, Credits, NotFound
├── App.jsx                   routes
└── main.jsx
```

**State:** `useState` inside each page. One React Context holds the selected report year, because the header selector, the landing page and the calculator all need it. No Redux.

**Year selector:** at the left of the navigation band. Its options come from `GET /api/years/`. Changing it reloads the landing figures and re-runs the last calculation against that year's peers.

**Charts:** built by hand, with no chart library. The bar, column and range charts are HTML and CSS; the `Histogram` is one SVG drawn at the measured width of its container, with a line at the user's TRIR and another at the peer median. Every chart has hover and keyboard tooltips and a table view with the same numbers.

**Loading and error states:** `Loader` (animated dots with a message) wherever the page waits for data. Errors appear as a status screen (`StatusMessage`: code, short title, one sentence, "Try again"), placed right under the navigation by `PageAlert`. A request that never reaches the server is shown as 503.

**Styling:** custom CSS with design tokens in `index.css` (greens, grays and white; Merriweather for headings and Source Sans 3 for text). No CSS framework.

**Contact:** `ContactForm.jsx` with three internal steps (the form, code entry, confirmation), managed with `useState`, inside the Contact page. `api/client.js` has `postContact` and `postContactVerify`. Field errors appear next to the field; other failures use the same status screen as the rest of the site. Details in 4.6.

### 4.6 Contact

**Goal:** a visitor can send me a message (email + message body), after proving their email is real and that they are not a bot.

This layer is an extension, not part of the MVP, and it must not delay the analysis notebook. It is built and tested, and runs on Cloudflare's test keys with emails printed in the Django terminal until the real keys and an SMTP provider are configured.

Code: `backend/contact/` (`models.py`, `rules.py`, `turnstile.py`, `services.py`, `views.py`, 14 tests) and `frontend/src/components/contact/ContactForm.jsx`.

**Flow**

1. The visitor fills in email + message and completes Turnstile, then `POST /api/contact/`.
2. Django validates the Turnstile token and the fields, stores the message as `pending` with the **hash** of the code and an expiry, and emails the code to the visitor.
3. The visitor enters the code in the same component, then `POST /api/contact/verify/`.
4. If the code is correct and not expired, Django emails the message to me, marks the record `verified`, and returns success.

**Stack**

- **Captcha:** Cloudflare Turnstile. The frontend uses `@marsidev/react-turnstile`; the backend validates the token with a POST to Cloudflare's `siteverify` endpoint. The frontend alone is never trusted.
- **Email:** Django `send_mail` (and `EmailMessage`, which is needed to set `Reply-To`) with a transactional provider over SMTP (Resend or Brevo, free tier; choice TBD). Without `EMAIL_HOST`, `config/settings.py` uses Django's console email backend, so in development the emails are printed in the terminal.
  - `From` is my own domain or the provider's domain, never the visitor's address.
  - The visitor's email goes in `Reply-To`.
- **Verification:** a 6-digit code, not a link, entered in the same React component as a second step. A link would need its own verification route and a token in the URL; the code keeps the whole flow inside one component.
- **Code storage:** the code is hashed with a key (`SECRET_KEY`) and bound to its message id. A 6-digit code has only a million possibilities, so a plain hash could be reversed by anyone who read the table.
- **Anti-abuse:** a hidden honeypot field (a filled one gets the same answer as a real submission, and nothing is stored or sent), plus DRF throttling with its own scopes: 5 messages per hour per IP (30 in development) and 30 code checks per hour.
- Email is sent synchronously inside the request. No Celery.

**Data model:** new table `contact_message`, in a new `contact/` Django app.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | returned to the frontend to reference the pending message |
| `email` | text | |
| `message` | text | max 2,000 characters |
| `code_hash` | text | the plain code is never stored |
| `status` | enum | `pending`, `verified`, `expired` |
| `attempts` | int | max 5 wrong codes, then the message is invalidated (stored as `expired`) |
| `created_at` | timestamp | |
| `expires_at` | timestamp | 15 minutes after creation |

**Error cases**

| Case | Endpoint | Response |
|---|---|---|
| Invalid fields | both | `400` with field errors, like the benchmark form |
| Throttled | both | `429`, DRF's standard throttle response |
| Invalid captcha | `/contact/` | `400` with a `captcha_token` error; nothing is stored or sent |
| Wrong code | `/contact/verify/` | `400` with a `code` error saying how many tries are left; counts toward `attempts` |
| Expired code | `/contact/verify/` | `410`, `error: "expired"` |
| Too many attempts | `/contact/verify/` | `410`, `error: "too_many_attempts"`; the message can no longer be verified |
| Unknown message id | `/contact/verify/` | `404` |
| Email can't be sent | both | `503`; a pending message is removed, a verified-but-unsent one can be retried with the same code |

**Environment variables**

| Variable | Where | Purpose |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | `backend/.env` | server-side token validation |
| `VITE_TURNSTILE_SITE_KEY` | `frontend/.env` | the widget's public key |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | `backend/.env` | SMTP provider |
| `EMAIL_PORT` | `backend/.env` | SMTP port, default 587 (TLS) |
| `DEFAULT_FROM_EMAIL` | `backend/.env` | the sender address, on a domain the provider has verified |
| `CONTACT_RECIPIENT_EMAIL` | `backend/.env` | where verified messages are forwarded |

**Still to decide (TBD)**

- Provider: Resend or Brevo, and with it the real `From` address
- How long `contact_message` rows are kept. This is the first table that holds personal data (visitors' email addresses), so it needs a retention rule; today nothing deletes them

The values chosen for the other open points (expiry, lengths, rates, status codes) are recorded in `docs/decisions.md`, D-010.

With both Turnstile keys empty in development, the app uses Cloudflare's published test keys: the widget always passes and the test secret accepts any token. Outside `DEBUG`, a missing secret key makes every message fail the captcha check.

---

## 5. Why this scales

Simple today, but every future extension already has a place to land:

| Future extension | Where it plugs in | What stays untouched |
|---|---|---|
| User accounts | `accounts/` app, Django user model | nothing breaks, DRF is ready |
| Saved benchmarks | new table with FK to user | the calculation is unchanged |
| CSV upload | new endpoint reusing the calculation logic | the form keeps working |
| Explorer screen | new React route + paginated endpoint | the current screens are untouched |
| Case Detail (300/301) | new table with FK to establishment | 300A data stays intact |
| More years | same command with a different file; the year selector and `?year=` are already built | no code change |
| Scheduled refresh | GitHub Action calling the management command | the command already exists |
| Contact form | `contact/` app with its own table and endpoints | the benchmark core stays read-only |

Four decisions make this possible: ingestion as a management command rather than a loose script, aggregation in SQL rather than in the client, year as a column rather than a table per year, and write paths isolated in their own app. The `contact/` app is what lets the site accept messages while `core/`, `ingest/` and `api/` stay read-only.

---

## 6. Repository structure

```
OSHA-capstone/
├── README.md                 (planned, Phase 6)
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   ├── decisions.md          ← decision log
│   ├── summary_data_dictionary.pdf   OSHA's data dictionary
│   └── data-dictionary.md    (planned, Phase 6)
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/               settings, urls
│   ├── core/                 models, migrations, rules, NAICS crosswalk and titles
│   ├── ingest/               cleaning pipeline, load_ita command
│   ├── api/                  serializers, views, benchmark, insights, exception handler
│   └── contact/              contact_message model, Turnstile check, two endpoints
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api/              client.js
│       ├── lib/              year context, hooks, errors, format
│       ├── components/
│       │   ├── layout/  benchmark/  charts/  states/
│       │   └── contact/ContactForm.jsx
│       └── pages/            Landing, Benchmark, Contact, Credits, NotFound
├── analysis/
│   ├── ita.py                shared loader for the notebooks
│   ├── 01_profiling.ipynb
│   ├── 02_cleaning_rules.ipynb
│   └── 03_findings.ipynb     (planned, Phase 5)
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
- [x] Landing-page figures endpoint (`/api/insights/`)
- [x] Loaded-years endpoint (`/api/years/`)
- [x] JSON responses for unexpected errors (500, 503)

### Phase 4 — Frontend
- [x] Four-field form with validation
- [x] API client with loading and error states
- [x] Result panel
- [x] Histogram with reference line
- [x] Empty states and visible error messages
- [x] Landing page with six findings and charts
- [x] Report-year selector
- [x] Own visual design (no CSS framework)

### Phase 5 — Analysis
- [ ] Findings notebook, three minimum
- [ ] One-page written summary
- [ ] Supporting charts

The landing page already shows six findings computed by `/api/insights/`. The notebook that documents and defends them is still pending.

### Phase 6 — Wrap-up
- [ ] README with architecture diagram
- [ ] Data dictionary
- [ ] Dataset limitations section
- [ ] `decisions.md` complete
- [ ] Deploy (if time allows)
- [ ] Three-minute recorded demo

### Phase 7 — Contact (post-MVP)

Built ahead of the analysis notebook, which is still pending and still must not be cut.

- [x] `contact/` app: `contact_message` model and migration
- [x] Turnstile token validation against `siteverify`
- [x] Code generation, hashing and expiry
- [x] Email sending (code to the visitor, message to me)
- [x] Both endpoints (`/api/contact/`, `/api/contact/verify/`)
- [x] Throttle scope and honeypot field
- [x] Frontend two-step form (`ContactForm.jsx`)
- [x] Error states for all six error cases
- [ ] Real Turnstile keys (Cloudflare dashboard)
- [ ] SMTP provider account, sender domain and recipient address
- [ ] Retention rule for `contact_message` rows

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cleaning takes longer than planned | High | Phase 0 before any backend work; if the CSV looks unmanageable after two hours, reassess |
| 6-digit cohorts too small | High | 4-digit, then 3-digit fallback built (D-009) |
| Django learning curve eats time | Medium | No authentication in the MVP, which is the hard part |
| Deployment consumes the final week | Medium | Deploy is "Should ship", not "Must ship" |
| Scope creep toward accounts and explorer | High | Cut line documented and enforced |
| Contact emails land in spam or aren't delivered | Medium | Send from my own or the provider's domain with the domain records the provider asks for; visitor's address only in `Reply-To`; test with real inboxes before relying on it |
| Contact feature grows (threads, an inbox screen, accounts) or delays the MVP | Medium | It is a mailbox only, scheduled as Phase 7 after the MVP and the notebook; anything beyond the two endpoints is out of scope |

---

## 9. Out of scope

User accounts, CSV upload, explorer screen, Case Detail data, NLP on incident narratives, PDF export, automated orchestration, BLS SOII comparison.

All of it is accounted for in the design and has a place to land, but none of it gets built in this version.

**Cut line (reworded in v0.3):** no user accounts and no saved user data, and no screen that browses or exports individual establishments.

> **Flag: the original cut line no longer described the project.** It read "nothing that stores user state, nothing that adds a second screen." Both halves had to change:
>
> - *"Nothing that stores user state"* now distinguishes **user state** (accounts, sessions, saved benchmarks: still out) from the **contact mailbox** (`contact_message`: messages a visitor sends me, which no visitor can read back, kept in an isolated app). The mailbox is allowed; user state is not.
> - *"Nothing that adds a second screen"* was already crossed before the contact feature: the site has a landing page, the calculator, a Contact page and Credits. The intent behind it survives as "no explorer screen". The contact feature respects it by replacing the Comments page rather than adding a route.

**Exception:** the analysis notebook is never cut, under any circumstances.
