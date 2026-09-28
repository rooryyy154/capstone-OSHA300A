# Data decisions log

Every rule that changes which OSHA rows count, or how a plant is compared, is recorded here: what was decided, what else was considered, and why. The evidence comes from `analysis/02_cleaning_rules.ipynb` and from the `load_ita` quality report on the 2025 file (`ita_300a_2025.csv`, calendar year 2025).

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

---

## D-001 · Malformed CSV rows

**Decision:** drop rows with an empty `id` or empty `total_hours_worked` (6 rows).

**Why:** these are records that OSHA's export broke across two lines, leaving half a record in each. They can't be stitched back together reliably, and 6 rows out of 383k don't change any result.

## D-002 · Unique key and reloads

**Decision:** one row per `(establishment_id, year)`, enforced by a unique constraint. `load_ita` replaces a whole year inside one transaction: delete that year's rows, insert the accepted ones, refresh `cohort_stats`.

**Evidence:** the 2025 file has 0 duplicates on `(establishment_id, year_filing_for)`.

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

---

## Known limitations

- **One year of data (2025).** The model and command support more (`year` is a column), but only this file is loaded.
- **Industry labels** come from the description plants type most often for each code, not from the official Census titles, so a few are odd. Loading the Census 2022 NAICS titles would fix this, and it goes with option A of D-006.
- **Establishments that must report.** OSHA only requires electronic 300A submissions from some establishments (by size and industry), so the data isn't a random sample of all US workplaces.
- **Self-reported data.** Undercounting injuries would make a plant look better than it is, and nothing in the file can detect that.
