# API contract

Base URL (local): `http://localhost:8000/api`. JSON in, JSON out. No authentication; anonymous clients are throttled at 120 requests per minute.

## POST `/benchmark/`

Calculates a plant's TRIR and compares it with its industry peers. Writes nothing.

### Request

| Field | Type | Required | Rules |
|---|---|---|---|
| `naics_code` | string | yes | 6 digits and a real NAICS industry (D-008). Older retail codes are accepted and remapped (D-006). |
| `annual_average_employees` | integer | yes | ≥ 1 |
| `total_hours_worked` | integer | yes | ≥ 1, and hours ÷ employees between 250 and 8,760 (D-004) |
| `total_recordable_cases` | integer | yes | ≥ 0, and ≤ `annual_average_employees` (D-008) |
| `ownership` | string | no | `private` (default), `government` or `all`: which plants form the peer group (D-007) |
| `year` | integer | no | Defaults to the latest loaded year |

```json
{
  "naics_code": "332710",
  "annual_average_employees": 120,
  "total_hours_worked": 240000,
  "total_recordable_cases": 4,
  "ownership": "private"
}
```

### Response `200`

```json
{
  "input": {
    "naics_code": "332710", "naics_code_reported": "332710",
    "annual_average_employees": 120, "total_hours_worked": 240000, "total_recordable_cases": 4,
    "ownership": "private", "year": 2025
  },
  "industry": { "code": "332710", "label": "Machine shops" },
  "plant": {
    "trir": 3.33,
    "trir_interval": { "low": 0.91, "high": 8.53, "confidence": 0.95 },
    "one_case_adds": 0.83,
    "hours_per_employee": 2000
  },
  "cohort": {
    "year": 2025, "ownership": "private", "level": 6, "naics_prefix": "332710",
    "establishment_count": 1222,
    "p25": 0.0, "median": 2.19, "p75": 4.83, "p90": 8.43,
    "pooled_trir": 2.79, "share_zero": 0.3723
  },
  "rank": { "percentile": 63.2, "below": 772, "tied": 1, "above": 449 },
  "comparison": {
    "difference_from_median": 1.15,
    "percent_from_median": 52.4,
    "expected_cases_at_median": 2.62,
    "verdict": "typical",
    "differs_from_median": "not_significant"
  },
  "histogram": {
    "bin_width": 1,
    "bins": [
      { "start": 0, "end": 1, "count": 485 },
      { "start": 1, "end": 2, "count": 106 },
      "…",
      { "start": 13, "end": null, "count": 38 }
    ]
  },
  "warnings": []
}
```

| Field | Meaning |
|---|---|
| `plant.trir` | Recordable cases × 200,000 ÷ hours, rounded half-up to 2 decimals |
| `plant.trir_interval` | Exact 95% Poisson range for the TRIR. With few cases it is wide: the true rate could reasonably be anywhere in it. |
| `plant.one_case_adds` | How much one extra case would raise the TRIR (200,000 ÷ hours) |
| `cohort` | The peer group actually used. `level` < 6 means the 4- or 3-digit fallback (D-009). |
| `cohort.pooled_trir` | Total cases ÷ total hours of all peers × 200,000, the way BLS computes industry rates |
| `cohort.share_zero` | Share of peers with zero recordable cases (0–1) |
| `rank.percentile` | Mid-rank percentile: % of peers below, counting half of the ties (D-005) |
| `rank.below / tied / above` | Raw peer counts, e.g. for "you're tied with 37% of plants at zero" |
| `comparison.expected_cases_at_median` | Cases a plant with your hours would have at the peer median rate |
| `comparison.verdict` | `low` (< 25th percentile), `typical` (25–75), `high` (75–90), `very_high` (90+) |
| `comparison.differs_from_median` | `below` / `above` when the 95% range excludes the median; otherwise `not_significant` |
| `histogram.bins` | Equal-width bins from 0; the last bin has `end: null` and holds everything above. The range always includes the user's TRIR. |

`cohort`, `rank`, `comparison` and `histogram` are `null` when no peer group reaches 30 plants, even at 3 digits. The TRIR is still returned.

### Warnings

`warnings` is a list of `{ "code", "message" }`. The `message` is ready to show to the user.

| Code | When |
|---|---|
| `naics_remapped` | The code was from an older NAICS edition and was compared as its 2022 code |
| `small_plant` | Fewer than 10,000 hours worked, so the rate is volatile (D-003) |
| `broader_cohort` | The 6-digit cohort was too small; a 4- or 3-digit cohort was used |
| `no_cohort` | No peer group reaches 30 plants; no percentile |

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "<field>": ["message"] }` | Field validation, as in the table above |
| `400` | `{ "detail": "No OSHA data loaded for 2019." }` | `year` not loaded |
| `503` | `{ "detail": "No OSHA data is loaded yet. …" }` | Database empty: run `load_ita` |
| `503` | `{ "detail": "The database is unavailable." }` | PostgreSQL is down or unreachable (any endpoint) |
| `500` | `{ "detail": "Internal server error." }` | Any other unexpected failure (any endpoint); the traceback goes to the server log |
| `429` | `{ "detail": "Request was throttled. …" }` | More than 120 requests per minute from one client |

Every error body is JSON, never Django's HTML error page (`api/exceptions.py`). The frontend shows each as a status screen: code, short title, one sentence and a "Try again" button. When the server can't be reached at all there is no HTTP status, and the frontend shows it as 503.

## GET `/years/`

The report years loaded in the database, newest first. The site's year selector is built from it, so loading another year with `load_ita` makes it appear with no frontend change.

```json
{ "years": [2025], "latest": 2025 }
```

`latest` is `null` when nothing is loaded.

## GET `/insights/?year=`

Headline figures for the landing page, for one year (default: the latest). Rates are pooled (Σ cases × 200,000 ÷ Σ hours). `totals` and `ownership` cover all establishments; `sectors`, `size_bands`, `top_industries` and `largest_industries` cover private establishments only.

| Key | Contents |
|---|---|
| `totals` | Establishments, employees, hours, recordable and DART cases, deaths, pooled TRIR and DART, share with zero cases, median TRIR |
| `ownership` | Private, state and local government: establishments, pooled and median TRIR |
| `sectors` | Each NAICS sector (`31-33`, `44-45`… with official titles): establishments, TRIR, DART, deaths, sorted by TRIR |
| `size_bands` | Employee bands (1–19 … 1,000+): establishments, TRIR, share with zero cases |
| `top_industries` | The 8 highest-TRIR 6-digit industries with at least 200 establishments |
| `largest_industries` | The 5 industries with the most establishments, with TRIR p10, p25, median, p75, p90 |

Cached per year and row count, so a reload with `load_ita` is picked up on the next request.

## GET `/industries/?q=&year=&limit=`

NAICS search for the form's autocomplete. `q` is either a code prefix (`3327`) or words from the label (`machine`). A full 6-digit old retail code is remapped (`452210` → `455110`). `limit` defaults to 20, maximum 50.

```json
[
  { "code": "332710", "label": "Machine shops", "establishment_count": 1222 }
]
```

`establishment_count` counts all owners in `year` (default: the latest) at the 6-digit level.

`year` errors on `/insights/` and `/industries/` follow the benchmark endpoint: `400` for a year that isn't loaded, `503` when the database is empty.

## GET `/health/`

`{ "status": "ok" }`: the frontend uses it to check that the API is reachable.

## POST `/contact/`

Step 1 of the contact form (D-010): checks the captcha and the fields, stores the message as pending, and emails a 6-digit code to the visitor. Throttled at 5 requests per hour per IP (30 in development).

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | yes | A valid email address |
| `message` | string | yes | 1 to 2,000 characters |
| `captcha_token` | string | yes | The token the Turnstile widget produced. Checked with Cloudflare's `siteverify`; a token works once |
| `website` | string | no | Honeypot. Real visitors never see it; leave it empty |

### Response `201`

```json
{ "id": "4d843375-f191-4de1-bdb5-3be647de2e92", "email": "visitor@example.com", "expires_in_minutes": 15 }
```

`id` identifies the pending message in step 2. A request with the honeypot filled gets the same shape of answer, but nothing is stored or sent.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "email": ["…"], "message": ["…"] }` | Invalid fields |
| `400` | `{ "captcha_token": ["…"] }` | The captcha token is missing, spent or rejected by Cloudflare |
| `429` | `{ "detail": "Request was throttled. …" }` | Too many messages from this IP |
| `503` | `{ "detail": "We couldn't send the email right now. …" }` | The code email couldn't be sent; the pending message is removed |

## POST `/contact/verify/`

Step 2: checks the code and, if it is right, emails the message to the site owner with the visitor's address in `Reply-To`. Throttled at 30 requests per hour per IP.

```json
{ "id": "4d843375-f191-4de1-bdb5-3be647de2e92", "code": "980219" }
```

### Response `200`

```json
{ "status": "verified" }
```

Verifying an already verified message returns `200` again and sends nothing.

### Errors

| Status | Body | When |
|---|---|---|
| `400` | `{ "code": ["That code isn't right. You have 4 tries left."] }` | Wrong code; counts as one of 5 attempts |
| `400` | `{ "code": ["Enter the 6-digit code from the email."] }` | Not 6 digits; not counted as an attempt |
| `404` | `{ "detail": "…", "error": "not_found" }` | Unknown `id` |
| `410` | `{ "detail": "…", "error": "expired" }` | More than 15 minutes since the code was sent |
| `410` | `{ "detail": "…", "error": "too_many_attempts" }` | 5 wrong codes; the message can't be verified anymore |
| `503` | `{ "detail": "We couldn't send the email right now. …" }` | The message couldn't be forwarded; the same code can be submitted again |

On `404` and `410` the frontend returns to the form with the message kept, so the visitor can send it again and get a new code.
