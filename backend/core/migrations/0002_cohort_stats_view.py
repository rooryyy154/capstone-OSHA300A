from django.db import migrations

# Every establishment belongs to two ownership scopes (its own, and 'all') at three NAICS
# levels (6, 4, 3 digits), so each plant feeds six cohorts. Percentiles are computed on the
# stored 2-decimal TRIR; pooled_trir weighs plants by hours, the way BLS computes industry rates.
CREATE_VIEW = """
CREATE MATERIALIZED VIEW cohort_stats AS
WITH scoped AS (
    SELECT year, 'all' AS ownership, naics_code, trir, recordable_cases, total_hours_worked
    FROM establishment_summary
    UNION ALL
    SELECT year,
           CASE WHEN establishment_type = 1 THEN 'private' ELSE 'government' END,
           naics_code, trir, recordable_cases, total_hours_worked
    FROM establishment_summary
),
members AS (
    SELECT scoped.*, levels.level, left(scoped.naics_code, levels.level) AS naics_prefix
    FROM scoped CROSS JOIN (VALUES (6), (4), (3)) AS levels (level)
)
SELECT
    row_number() OVER (ORDER BY year, ownership, level, naics_prefix) AS id,
    year,
    ownership,
    level,
    naics_prefix,
    count(*)::int AS establishment_count,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY trir) AS p25_trir,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY trir) AS median_trir,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY trir) AS p75_trir,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY trir) AS p90_trir,
    avg((trir = 0)::int)::float8 AS share_zero,
    (sum(recordable_cases) * 200000.0 / sum(total_hours_worked))::float8 AS pooled_trir
FROM members
GROUP BY year, ownership, level, naics_prefix;

CREATE UNIQUE INDEX cohort_stats_key ON cohort_stats (year, ownership, level, naics_prefix);
"""


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(CREATE_VIEW, reverse_sql='DROP MATERIALIZED VIEW IF EXISTS cohort_stats;'),
    ]
