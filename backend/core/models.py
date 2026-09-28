from django.db import connection, models

from .rules import ESTABLISHMENT_TYPE_CHOICES, OWNERSHIP_CHOICES


class Establishment(models.Model):
    """One OSHA Form 300A summary: one establishment in one calendar year (D-002)."""

    year = models.PositiveSmallIntegerField()
    establishment_id = models.CharField(max_length=20)
    establishment_name = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=2)

    # D-006: the code the plant reported, and its 2022 equivalent used for cohorts
    naics_code = models.CharField(max_length=6)
    naics_code_reported = models.CharField(max_length=6)
    naics_year = models.PositiveSmallIntegerField(null=True, blank=True)
    industry_description = models.CharField(max_length=255, blank=True)

    # D-007: 1 = private, 2 = state government, 3 = local government
    establishment_type = models.PositiveSmallIntegerField(choices=ESTABLISHMENT_TYPE_CHOICES)

    annual_average_employees = models.PositiveIntegerField()
    total_hours_worked = models.BigIntegerField()

    # Form 300A columns G-J, and the day counts behind DART severity
    total_deaths = models.PositiveIntegerField()
    total_dafw_cases = models.PositiveIntegerField()
    total_djtr_cases = models.PositiveIntegerField()
    total_other_cases = models.PositiveIntegerField()
    total_dafw_days = models.PositiveIntegerField()
    total_djtr_days = models.PositiveIntegerField()

    # Derived once at ingestion, never per request
    recordable_cases = models.PositiveIntegerField()
    trir = models.DecimalField(max_digits=8, decimal_places=2)
    dart = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        db_table = 'establishment_summary'
        constraints = [
            models.UniqueConstraint(fields=['establishment_id', 'year'], name='unique_establishment_year'),
        ]
        indexes = [
            # Serves the request-time rank and histogram queries: exact year, NAICS prefix
            # (LIKE '3327%' needs varchar_pattern_ops), then TRIR comparisons.
            models.Index(
                fields=['year', 'naics_code', 'trir'],
                name='establishment_cohort_idx',
                opclasses=['int2_ops', 'varchar_pattern_ops', 'numeric_ops'],
            ),
        ]

    def __str__(self):
        return f'{self.establishment_name} ({self.year})'


class NaicsIndustry(models.Model):
    """NAICS catalog for the industry search. Labels come from the descriptions plants report."""

    code = models.CharField(max_length=6, primary_key=True)
    label = models.CharField(max_length=255)

    class Meta:
        db_table = 'naics_reference'
        ordering = ['code']
        verbose_name_plural = 'NAICS industries'

    def __str__(self):
        return f'{self.code} {self.label}'


class CohortStats(models.Model):
    """Precomputed statistics per peer group. A PostgreSQL materialized view (see migration 0002).

    One row per (year, ownership, NAICS level, NAICS prefix). Everything that doesn't depend
    on the user's numbers lives here; the user's exact rank is counted at request time (D-005).
    """

    year = models.PositiveSmallIntegerField()
    ownership = models.CharField(max_length=10, choices=OWNERSHIP_CHOICES)
    level = models.PositiveSmallIntegerField()
    naics_prefix = models.CharField(max_length=6)
    establishment_count = models.IntegerField()
    p25_trir = models.FloatField()
    median_trir = models.FloatField()
    p75_trir = models.FloatField()
    p90_trir = models.FloatField()
    share_zero = models.FloatField()
    pooled_trir = models.FloatField()

    class Meta:
        managed = False
        db_table = 'cohort_stats'

    def __str__(self):
        return f'{self.year} {self.ownership} NAICS {self.naics_prefix} (n={self.establishment_count})'

    @staticmethod
    def refresh():
        with connection.cursor() as cursor:
            cursor.execute('REFRESH MATERIALIZED VIEW cohort_stats')
