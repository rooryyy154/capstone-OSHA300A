# Data decisions log

Every rule that changes which OSHA rows count, or how a plant is compared, is recorded here: what was decided, what else was considered, and why. The evidence comes from `analysis/02_cleaning_rules.ipynb` and from the `load_ita` quality report on the 2025 file (`ita_300a_2025.csv`, calendar year 2025). The rules were set on 2025 and then applied unchanged to the 2024 file (D-011).

The thresholds live in one place in code, `backend/core/rules.py`, and are used both when loading OSHA's data and when validating the user's form. A plant we would drop from the data can't be benchmarked against it either.

| ID | Topic | Status | Decision |
|---|---|---|---|
| D-001 | Malformed CSV rows | Decided | Drop the 6 rows that OSHA's export split across lines |
| D-002 | Unique key and reloads | Decided | `(establishment_id, year)`; a reload replaces the whole year |
| D-003 | Minimum hours worked | Decided | 10,000 hours |
| D-004 | Hours per employee | Decided | Between 250 and 8,760 |
| D-005 | Percentile definition | Decided | Mid-rank, counted exactly at request time |
| D-006 | NAICS editions | Decided | Remap retail (44-45) codes to NAICS 2022; others as reported |
| D-007 | Government establishments | Decided | Keep them; the user picks the peer group (private by default) |
| D-008 | Other inconsistent rows | Decided | Drop invalid NAICS and cases > employees; keep the rest |
| D-009 | Minimum cohort size | Decided | 30 plants; fall back 6 → 4 → 3 NAICS digits |
| D-010 | Contact form (post-MVP) | Built; keys and provider pending | Turnstile captcha, 6-digit email code, synchronous email; isolated `contact/` app |
| D-011 | More than one year | Decided | Same rules for every year; the newest loaded year names the industries |

D-001 to D-009 and D-011 are data decisions. D-010 is a product decision, recorded here because it changes the "read-only system" rule.

## Quality report, 2025 file

Output of `python manage.py load_ita --file ../data/raw/ita_300a_2025.csv`. Each dropped row is counted under the **first** rule it fails, in this order.

| | Rows | % of rows checked |
|---|---:|---:|
| Raw rows | 383,283 | |
| Malformed (D-001) | 6 | |
| **Rows checked** | **383,277** | |
| Hours worked ≤ 0 | 1,834 | 0.48% |
| Average employees ≤ 0 | 2,794 | 0.73% |
| Invalid NAICS code (D-008) | 44 | 0.01% |
| Missing establishment type (D-007) | 437 | 0.11% |
| Hours worked < 10,000 (D-003) | 47,595 | 12.42% |
| Hours per employee > 8,760 (D-004) | 1,987 | 0.52% |
| Hours per employee < 250 (D-004) | 1,383 | 0.36% |
| Cases > average employees (D-008) | 27 | 0.01% |
| **Total dropped** | **56,101** | **14.64%** |
| **Accepted** | **327,176** | **85.36%** |

Of the accepted plants, 303,462 are private, 14,116 state government and 9,598 local government. 18,443 retail rows were remapped to their 2022 NAICS code (D-006).

## Quality report, 2024 file

Output of `python manage.py load_ita --file ../data/raw/ita_300a_2024.csv`, loaded on 2026-10-05. The file is OSHA's `ITA_300A_Summary_Data_2024_through_12-31-2025` (calendar year 2024). Same rules, same order, no threshold changed.

| | Rows | % of rows checked | 2025, for comparison |
|---|---:|---:|---:|
| Raw rows | 398,620 | | 383,283 |
| Malformed (D-001) | 0 | | 6 |
| **Rows checked** | **398,620** | | **383,277** |
| Hours worked ≤ 0 | 1,574 | 0.39% | 0.48% |
| Average employees ≤ 0 | 196 | 0.05% | 0.73% |
| Invalid NAICS code (D-008) | 203 | 0.05% | 0.01% |
| Missing establishment type (D-007) | 555 | 0.14% | 0.11% |
| Hours worked < 10,000 (D-003) | 44,341 | 11.12% | 12.42% |
| Hours per employee > 8,760 (D-004) | 2,317 | 0.58% | 0.52% |
| Hours per employee < 250 (D-004) | 2,976 | 0.75% | 0.36% |
| Cases > average employees (D-008) | 26 | 0.01% | 0.01% |
| **Total dropped** | **52,188** | **13.09%** | **14.64%** |
| **Accepted** | **346,432** | **86.91%** | **85.36%** |

Of the accepted plants, 322,520 are private, 14,023 state government and 9,889 local government. 22,681 retail rows were remapped to their 2022 NAICS code (D-006).

What was checked before loading:

- **Columns.** The 2024 file has the same 32 columns as 2025. Two of them (`change_reason`, `created_timestamp`) are in the opposite order, which doesn't matter because the loader reads columns by name.
- **Duplicates.** 0 on `(establishment_id, year_filing_for)`, so the unique key holds (D-002). Every row has `year_filing_for` = 2024.
- **NAICS editions.** `naics_year` is 2022 on 56% of rows, 2012 on 41% and 2017 on 3%. After the retail crosswalk, only 34 codes (58 plants) are not already in the 2025 catalog. The 203 rows with an invalid code are the same kind as in 2025 (padded subsectors such as 488100 and 811300, and codes with no real sector); all 203 carry `naics_year` = 0.
- **The two rules that moved most.** Employees ≤ 0 fell from 0.73% to 0.05% and hours per employee < 250 rose from 0.36% to 0.75%. Both are small shares, and the total dropped is within two points of 2025.

Plausibility, 2024 against 2025 (the industry rows are private plants):

| | 2024 | 2025 |
|---|---:|---:|
| Pooled TRIR, all establishments | 3.61 | 3.45 |
| Median TRIR, all establishments | 2.27 | 2.18 |
| Share with zero cases | 37.0% | 37.3% |
| 332710 Machine shops: plants, median | 1,458 · 2.07 | 1,222 · 2.19 |
| 445110 Supermarkets: plants, median | 18,473 · 3.43 | 18,136 · 3.24 |
| 493110 General warehousing: plants, median | 7,647 · 1.99 | 6,978 · 2.00 |
| 623110 Nursing care facilities: plants, median | 8,223 · 4.68 | 8,117 · 4.18 |
| 455110 Department stores: plants, median | 5,248 · 2.87 | 5,484 · 2.49 |

The same sector leads both years (transportation and warehousing, 5.42 and 5.41) and the same industry tops the large-industry ranking (veterinary services). Cohort coverage (D-009) is also the same shape: 98.9% of private plants and 93.8% of government plants get a 6-digit cohort in 2024.

---

## D-001 · Malformed CSV rows

**Decision:** drop rows with an empty `id` or empty `total_hours_worked` (6 rows).

**Why:** these are records that OSHA's export broke across two lines, leaving half a record in each. They can't be stitched back together reliably, and 6 rows out of 383k don't change any result.

## D-002 · Unique key and reloads

**Decision:** one row per `(establishment_id, year)`, enforced by a unique constraint. `load_ita` replaces a whole year inside one transaction: delete that year's rows, insert the accepted ones, refresh `cohort_stats`.

**Evidence:** the 2025 and 2024 files each have 0 duplicates on `(establishment_id, year_filing_for)`.

**Alternatives:** upsert with `ON CONFLICT DO UPDATE` (the original plan). Rejected, because upserting never removes a row. After tightening a rule, the rows it now drops would stay in the table from the previous run. Replacing the year keeps reloads idempotent *and* in sync with the current rules. The transaction means the API never sees a half-loaded year.

**Year:** the `year` column is `year_filing_for`, the calendar year the injuries happened in (2025 for this file), not the year the file was published.

## D-003 · Minimum hours worked: 10,000

**Decision:** drop establishments with fewer than 10,000 hours worked (about 5 full-time employees).

**Evidence:**
- TRIR is cases × 200,000 ÷ hours, so at 10,000 hours a single case is a TRIR of 20. Below that, one case produces rates of 40 to 100 or more.
- Plants under 10,000 hours are mostly zeros: 86% to 93% of them report no cases at all. Their rates are close to all-or-nothing, not a measure of safety performance.
- The cost is low. It drops 12.4% of rows, yet the share of plants sitting in a 6-digit cohort of 30 or more only moves from 99.08% to 98.89%.

**Alternatives:** 5,000 hours (keeps more plants, but one case is still a TRIR of 40); 20,000 or 40,000 hours (drops 22% to 35% of plants for little extra stability).

**For the user:** small plants can still use the tool. The API computes their rate and adds a `small_plant` warning saying how much one case moves it. The confidence range (see API) shows the uncertainty.

## D-004 · Hours per employee: 250 to 8,760

**Decision:** drop plants whose average hours per employee is above 8,760 or below 250.

**Evidence:**
- 8,760 hours is 24 × 365, a physical limit. Above it are typing errors such as 15 billion hours for 7 employees. With them, the pooled TRIR of all plants drops from 3.47 to 0.42, which is plainly wrong. 1,987 rows are dropped.
- Low values are partly real: food service contractors, staffing agencies and hotels have high turnover and part-time staff, and the median is 1,794 hours. Below 250 hours (about 6 weeks full-time), the headcount or the hours are almost certainly wrong. Example: 120 million employees with 727 hours. After D-003, 1,383 rows are dropped.

**Alternatives:** a tighter upper bound of 4,000 or 5,000 hours. Rejected, because overtime-heavy and 24/7 operations with low headcount can legitimately exceed them, and the notebook showed no clear break below 8,760.

**For the user:** the API rejects the form with a clear message if hours ÷ employees falls outside this range.

## D-005 · Percentile definition: mid-rank, exact

**Decision:** percentile = (plants below + ½ × plants tied) ÷ plants in cohort × 100. It is counted at request time with `COUNT(*) FILTER (...)` over the index on `(year, naics_code, trir)`. The API also returns the raw `below`, `tied` and `above` counts.

**Why:** ties at TRIR = 0 are the norm. 37% of plants report no cases, and in 130 of 492 large cohorts the median plant has TRIR 0.
- *Strict* ("% below") puts every zero-case plant at the 0th percentile. That's too flattering when 60% of peers are tied with them.
- *Weak* ("% at or below") puts them at the 60th percentile, which reads as "worse than most". That's wrong too.
- *Mid-rank* puts them in the middle of the tied group, the standard definition of percentile rank. The UI can then say it plainly: "you're tied with 60% of plants at zero cases".

**Storage:** `cohort_stats` (a materialized view) stores p25, median, p75, p90, the share at zero and the pooled rate. These are the same for every user, so they're precomputed. The exact rank depends on the user's TRIR, so it is counted per request. The largest cohort is about 18,000 plants, which is cheap to count on an index. Estimating the rank from histogram buckets was rejected: it is least accurate exactly where users cluster.

**Ties are exact:** stored rates and the user's rate go through the same function (`incidence_rate`, rounded half-up to 2 decimals). A plant and a user with the same numbers therefore always tie.

**Verdict bands** (on the mid-rank percentile): under 25 = `low`, 25–75 = `typical`, 75–90 = `high`, 90+ = `very_high`.

## D-006 · NAICS editions: remap retail to 2022

**Decision:** option B. A crosswalk (`backend/core/naics.py`) maps the 2012 and 2017 retail codes (sectors 44–45) that the 2022 revision renamed or merged onto their 2022 code. Both codes are stored: `naics_code_reported` (as filed) and `naics_code` (used for cohorts). The user's code goes through the same crosswalk, so someone typing an old code like 452210 is compared as 455110 and told so.

**Evidence:**
- `naics_year` can't identify the edition: 6,392 retail rows carry a 2022-only code with `naics_year` ≠ 2022.
- 19% of retail rows (11,302) still use pre-2022 codes.
- Before remapping, NAICS 455110 (department stores) had 489 plants. After remapping it has 5,484, because 452112, 452210 and 452111 plants join their real peers.

**Alternatives:**
- **A.** Map every code with the Census concordance tables. Most correct, but it needs the official files and a rule for codes that split one-to-many. This is the upgrade path.
- **C.** Keep codes as reported. Rejected: retail users would be compared with a fraction of their real peers.

**Not mapped:** 454110 (electronic shopping) and 454390 (direct selling), which 2022 split across many industries with no single target. Changes outside retail (for example in information, sector 51) are a known limitation.

## D-007 · Government establishments: the user chooses

**Decision:** keep state and local government plants, and store `establishment_type` on every row. Every request picks its peer group with `ownership`:

| `ownership` | Peers | Default |
|---|---|---|
| `private` | Private plants only | ✔ |
| `government` | State + local government plants | |
| `all` | Everyone | |

The 437 rows with a missing or invalid `establishment_type` are dropped, since they can't be placed in any peer group.

**Evidence:** in the same 6-digit industry, government and private plants have different injury profiles, so mixing them distorts the comparison:

| NAICS (2025, after cleaning) | Private median TRIR | Government median TRIR |
|---|---:|---:|
| 221310 Water supply | 0.00 (357 plants) | 3.33 (441 plants) |
| 237310 Highway construction | 1.71 (2,362 plants) | 0.04 (813 plants) |

Government is 97% of sector 92 and 82% of sector 61 (education), so dropping it would also remove those industries entirely.

**Alternatives:**
- **A.** Mix everyone. Distorts the utilities and road-construction examples above.
- **B.** Drop government. It's simplest, but public-sector EHS managers lose the tool.

**Why private is the default:** the product targets private-sector EHS managers.

**Possible refinement:** state and local government also differ (237310: state median 0.00, local 6.50). They could become separate filters later.

## D-008 · Other inconsistent rows

| Flag | Rows | Decision | Why |
|---|---:|---|---|
| NAICS code isn't a real industry | 44 | **Drop** | 15 have no real sector (999999, 283220…), 29 are padded subsectors (492100, 332700). OSHA doesn't validate the codes plants type. The form rejects them too. |
| Recordable cases > average employees | 27 after other rules | **Drop** | Logically inconsistent for nearly all industries. The form rejects it too. |
| `naics_year` not 2012/2017/2022 | 170 | **Keep** | All of them are valid codes (mostly 485410, school buses). `naics_year` is unreliable anyway (D-006) and isn't used. |
| DAFW days > 0 but DAFW cases = 0, or the reverse | 487 | **Keep** | Doesn't affect TRIR. Revisit if DART severity is ever reported. |
| Legacy size code 2 | 33,123 | **Ignore** | `size` isn't used; headcount comes from `annual_average_employees`. |

## D-009 · Minimum cohort size: 30, with a 6 → 4 → 3 fallback

**Decision:** a peer group needs at least 30 plants. If the 6-digit NAICS cohort is smaller, the API tries 4 digits, then 3. If none reaches 30, it returns the plant's TRIR with no percentile, plus a `no_cohort` warning. The response always states which level and prefix it used.

**Evidence:** coverage on the final 2025 data, with each plant looked up in its own peer group:

| Peer group | 6-digit | 4-digit | 3-digit | No percentile |
|---|---:|---:|---:|---:|
| Private | 98.9% | 0.9% | 0.2% | 0.05% |
| Government | 93.9% | 2.2% | 2.3% | 1.6% |
| All | 99.0% | 0.8% | 0.2% | 0.03% |

**Why 30:** with fewer plants, a single plant moves the percentile by more than 3 points, and quartiles jump between neighbouring values. Raising the minimum to 100 would push about 6% of plants off 6-digit cohorts (see the notebook, section 7.1).

**Why add 3 digits:** the original design fell back only to 4 digits. With the government filter (D-007), peer groups are smaller, and the 3-digit level gives 2.3% more government plants a percentile. A 3-digit subsector (for example 332, fabricated metal products) is still a meaningful comparison. The 2-digit level is not (31–33 is all of manufacturing).

## D-010 · Contact form with email verification (post-MVP)

**Status:** built and tested. It runs on Cloudflare's test keys, with emails printed in the Django terminal, until the real Turnstile keys and an SMTP provider are configured. It must not delay the analysis notebook.

**Decision:** the Comments page becomes a Contact page where a visitor sends me a message (email + message body) after proving they aren't a bot and that their email is real. The design is in `docs/architecture.md`, section 4.6. In short:

- **Captcha:** Cloudflare Turnstile, with the token validated on the server against Cloudflare's `siteverify`. The frontend alone is never trusted.
- **Email verification:** a 6-digit code emailed to the visitor and entered as a second step in the same React component. Only a keyed hash of the code is stored, with a 15-minute expiry and a limit of 5 wrong attempts.
- **Email sending:** Django `send_mail` over SMTP with a transactional provider (Resend or Brevo, TBD), sent synchronously inside the request. `From` is my own or the provider's domain; the visitor's address goes in `Reply-To`.
- **Anti-abuse:** a hidden honeypot field and dedicated DRF throttle scopes: 5 messages per hour per IP, and 30 code checks per hour.
- **Isolation:** a new `contact/` Django app with one table, `contact_message`. The benchmark apps (`core/`, `ingest/`, `api/`) stay read-only.

**Alternatives considered:**

| Choice | Alternative | Why not |
|---|---|---|
| Turnstile | reCAPTCHA, hCaptcha | Reasons to be written when this is built. |
| 6-digit code | Verification link | A link needs its own verification route and a token in the URL. The code keeps the whole flow inside one component. |
| Synchronous email | Celery (background queue) | A worker and a message broker are a lot of infrastructure for a form that sends a handful of emails. |
| Own endpoint + table | Formspree, Web3Forms | Reasons to be written when this is built. |

**Consequences:**

- The system is no longer purely read-only. The exception is one isolated write path: a mailbox, with no accounts and no session state.
- The cut line in `architecture.md` was reworded: "no user state" now means no accounts and no saved user data; the contact mailbox is allowed.
- `contact_message` is the first table with personal data (visitors' email addresses). How long rows are kept is TBD; today nothing deletes them.

**Values chosen while building** (all in `backend/contact/rules.py` or `config/settings.py`, easy to change):

| Open point | Chosen | Why |
|---|---|---|
| Code expiry | 15 minutes | The top of the 10 to 15 minute range: email can be slow to arrive. |
| Maximum message length | 2,000 characters | Room for a detailed question, small enough to limit abuse. |
| Message throttle | 5 per hour per IP (30 in development) | The rate proposed in the design; looser locally so the flow can be tested. |
| Code-check throttle | 30 per hour per IP | Each message already allows only 5 wrong codes. |
| After 5 wrong codes | The message is stored as `expired` | Keeps the three statuses of the design; no new value needed. |
| Filled honeypot | Same `201` answer as a real submission; nothing stored or sent | A bot that sees an error would learn to leave the field empty. |
| Status codes | `400` bad captcha or wrong code, `410` expired or too many attempts, `404` unknown id, `503` email failure | `410` says "this code is gone, start again", which is what the form does. |
| Code hash | HMAC-SHA256 keyed with `SECRET_KEY`, bound to the message id | A plain hash of a 6-digit code can be reversed by trying all million values. |
- Sending email inside the request means a slow or failing SMTP provider makes the form slow or fail. Accepted for now; revisit if it happens.

## D-011 · More than one year

**Decision:** every year goes through the same rules and thresholds, one `load_ita` run per file. Each year has its own peers: the cohorts, the landing figures and the industry counts are computed per year, and nothing is pooled across years. The site opens on the newest loaded year.

**Industry names:** `naics_reference` is one catalog shared by all years, so the label can't depend on which file was loaded last. The newest loaded year names the industries. Loading an older year only adds the codes the catalog doesn't have yet. Official titles from `core/naics.py` apply whichever year is loaded.

**Evidence:** before this rule, loading 2024 after 2025 would have rewritten 287 of the 1,084 shared labels with 2024's most common description, for example 238990 from "All Other Specialty Trade Contractors" to "Crane rental with operator". 2024 also put two industries on the landing page that had no official title (449121 and 455219), so both were added to `OFFICIAL_TITLES`.

**Alternatives:**
- Last load wins (the original behaviour). Rejected: the same database content could show different names depending on the order of the commands.
- A label per year. Rejected: the industry is the same in both years, and a name that changes when the user switches year reads as a different industry.

**Not done:** the rules were not re-tuned on 2024. The thresholds come from the 2025 notebook, and the 2024 quality report above is close enough to 2025 that they were left alone.

---

## Known limitations

- **Two years of data (2024 and 2025).** Earlier years can be added one file at a time, but OSHA's older files should be checked against the loader first.
- **Years aren't the same set of plants.** A different number of establishments reports each year, and the files are snapshots taken at different points: the 2024 file collects submissions through 12-31-2025, a full year after the deadline, while OSHA's 2025 release runs through 03-15-2026. Part of the difference in plant counts between the two years is probably late 2025 submissions that hadn't arrived yet. A change in an industry's rate between years is not the same plants improving or worsening.
- **Industry labels.** Sectors and the industries the landing page highlights use official NAICS 2022 titles (`backend/core/naics.py`). Every other code uses the description plants type most often, so a few are odd. Loading the full Census 2022 title file would fix this, and it goes with option A of D-006.
- **Establishments that must report.** OSHA only requires electronic 300A submissions from some establishments (by size and industry), so the data isn't a random sample of all US workplaces.
- **Self-reported data.** Undercounting injuries would make a plant look better than it is, and nothing in the file can detect that.
