"""Headline figures for the landing page, behind GET /api/insights/.

Everything is aggregated in SQL over establishment_summary. Rates are pooled (total cases
x 200,000 / total hours), the way BLS computes industry rates, so big and small plants
count in proportion to the hours they represent. Breakdowns cover private establishments
only, matching the benchmark's default peer group (D-007).

The result depends only on the loaded data, so it is cached per year and row count: a
reload with `load_ita` changes the count and the next request recomputes.
"""

from django.core.cache import cache
from django.db import connection

from core.models import Establishment
from core.naics import SECTOR_TITLES
from core.rules import PRIVATE_TYPE

MIN_INDUSTRY_SIZE = 200  # plants needed for an industry to appear in the rankings
TOP_INDUSTRIES = 8
SPREAD_INDUSTRIES = 5
CACHE_SECONDS = 60 * 60

POOLED = 'sum(recordable_cases) * 200000.0 / sum(total_hours_worked)'
POOLED_DART = 'sum(total_dafw_cases + total_djtr_cases) * 200000.0 / sum(total_hours_worked)'

SECTOR = """
    CASE WHEN left(naics_code, 2) IN ('31', '32', '33') THEN '31-33'
         WHEN left(naics_code, 2) IN ('44', '45') THEN '44-45'
         WHEN left(naics_code, 2) IN ('48', '49') THEN '48-49'
         ELSE left(naics_code, 2) END
"""

SIZE_BANDS = [(1, 19), (20, 49), (50, 99), (100, 249), (250, 499), (500, 999), (1000, None)]


def size_band_sql():
    cases = ' '.join(
        f'WHEN annual_average_employees <= {high} THEN {i}' for i, (_, high) in enumerate(SIZE_BANDS) if high
    )
    return f'CASE {cases} ELSE {len(SIZE_BANDS) - 1} END'


def fetch(sql, params):
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [col.name for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def number(value, digits=2):
    return None if value is None else round(float(value), digits)


def build(year):
    private = {'year': year, 'private': PRIVATE_TYPE}

    totals = fetch(f"""
        SELECT count(*) AS establishments,
               sum(annual_average_employees) AS employees,
               sum(total_hours_worked) AS hours_worked,
               sum(recordable_cases) AS recordable_cases,
               sum(total_dafw_cases + total_djtr_cases) AS dart_cases,
               sum(total_deaths) AS deaths,
               {POOLED} AS trir,
               {POOLED_DART} AS dart,
               avg((recordable_cases = 0)::int) AS share_zero,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY trir) AS median_trir
        FROM establishment_summary WHERE year = %(year)s
    """, {'year': year})[0]

    ownership = fetch(f"""
        SELECT establishment_type, count(*) AS establishments, {POOLED} AS trir,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY trir) AS median_trir
        FROM establishment_summary WHERE year = %(year)s
        GROUP BY 1 ORDER BY 1
    """, {'year': year})

    sectors = fetch(f"""
        SELECT {SECTOR} AS code, count(*) AS establishments, {POOLED} AS trir, {POOLED_DART} AS dart,
               sum(total_deaths) AS deaths
        FROM establishment_summary WHERE year = %(year)s AND establishment_type = %(private)s
        GROUP BY 1 ORDER BY trir DESC
    """, private)

    sizes = fetch(f"""
        SELECT {size_band_sql()} AS band, count(*) AS establishments, {POOLED} AS trir,
               avg((recordable_cases = 0)::int) AS share_zero
        FROM establishment_summary WHERE year = %(year)s AND establishment_type = %(private)s
        GROUP BY 1 ORDER BY 1
    """, private)

    top = fetch(f"""
        SELECT e.naics_code AS code, n.label, count(*) AS establishments, {POOLED} AS trir,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY e.trir) AS median_trir
        FROM establishment_summary e JOIN naics_reference n ON n.code = e.naics_code
        WHERE e.year = %(year)s AND e.establishment_type = %(private)s
        GROUP BY 1, 2 HAVING count(*) >= {MIN_INDUSTRY_SIZE}
        ORDER BY trir DESC LIMIT {TOP_INDUSTRIES}
    """, private)

    spread = fetch(f"""
        SELECT e.naics_code AS code, n.label, count(*) AS establishments,
               percentile_cont(0.10) WITHIN GROUP (ORDER BY e.trir) AS p10,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY e.trir) AS p25,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY e.trir) AS median,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY e.trir) AS p75,
               percentile_cont(0.90) WITHIN GROUP (ORDER BY e.trir) AS p90
        FROM establishment_summary e JOIN naics_reference n ON n.code = e.naics_code
        WHERE e.year = %(year)s AND e.establishment_type = %(private)s
        GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT {SPREAD_INDUSTRIES}
    """, private)

    owner_keys = {1: 'private', 2: 'state_government', 3: 'local_government'}
    return {
        'year': year,
        'scope': 'Breakdowns cover private establishments; totals cover all.',
        'totals': {
            'establishments': totals['establishments'],
            'employees': int(totals['employees']),
            'hours_worked': int(totals['hours_worked']),
            'recordable_cases': int(totals['recordable_cases']),
            'dart_cases': int(totals['dart_cases']),
            'deaths': int(totals['deaths']),
            'trir': number(totals['trir']),
            'dart': number(totals['dart']),
            'share_zero': number(totals['share_zero'], 4),
            'median_trir': number(totals['median_trir']),
        },
        'ownership': [
            {
                'ownership': owner_keys[row['establishment_type']],
                'establishments': row['establishments'],
                'trir': number(row['trir']),
                'median_trir': number(row['median_trir']),
            }
            for row in ownership
        ],
        'sectors': [
            {
                'code': row['code'],
                'title': SECTOR_TITLES.get(row['code'], f"NAICS {row['code']}"),
                'establishments': row['establishments'],
                'trir': number(row['trir']),
                'dart': number(row['dart']),
                'deaths': int(row['deaths']),
            }
            for row in sectors
        ],
        'size_bands': [
            {
                'min_employees': SIZE_BANDS[row['band']][0],
                'max_employees': SIZE_BANDS[row['band']][1],
                'establishments': row['establishments'],
                'trir': number(row['trir']),
                'share_zero': number(row['share_zero'], 4),
            }
            for row in sizes
        ],
        'top_industries': [
            {
                'code': row['code'],
                'label': row['label'],
                'establishments': row['establishments'],
                'trir': number(row['trir']),
                'median_trir': number(row['median_trir']),
            }
            for row in top
        ],
        'largest_industries': [
            {
                'code': row['code'],
                'label': row['label'],
                'establishments': row['establishments'],
                **{key: number(row[key]) for key in ['p10', 'p25', 'median', 'p75', 'p90']},
            }
            for row in spread
        ],
    }


def get_insights(year):
    rows = Establishment.objects.filter(year=year).count()
    key = f'insights:{year}:{rows}'
    result = cache.get(key)
    if result is None:
        result = build(year)
        cache.set(key, result, CACHE_SECONDS)
    return result
