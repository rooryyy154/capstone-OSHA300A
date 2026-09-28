"""The calculation behind POST /api/benchmark/.

Cohort statistics that don't depend on the user come precomputed from `cohort_stats`.
What does depend on the user's TRIR (exact rank, histogram range) is counted at request time
over the (year, naics_code, trir) index. It never touches more than one cohort of rows.
"""

import math
from decimal import Decimal

from django.db.models import Count, DecimalField, F, IntegerField, Max, Q, Value
from django.db.models.functions import Cast, Floor, Least
from scipy.stats import chi2

from core.models import CohortStats, Establishment, NaicsIndustry
from core.naics import normalize_naics
from core.rules import (
    ALL,
    COHORT_LEVELS,
    GOVERNMENT,
    GOVERNMENT_TYPES,
    MIN_COHORT_SIZE,
    MIN_HOURS_WORKED,
    PRIVATE,
    PRIVATE_TYPE,
    RATE_BASE_HOURS,
    incidence_rate,
)

CONFIDENCE = 0.95
HISTOGRAM_MAX_BINS = 20
HISTOGRAM_WIDTHS = (0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100)

# Mid-rank percentile cut points for the verdict (D-005)
VERDICTS = [(25, 'low'), (75, 'typical'), (90, 'high')]
PEER_NOUNS = {PRIVATE: 'private plants', GOVERNMENT: 'government plants', ALL: 'plants'}


class NoDataLoaded(Exception):
    pass


class YearNotLoaded(Exception):
    pass


def round_or_none(value, digits=2):
    return None if value is None else round(float(value), digits)


def poisson_interval(cases, confidence=CONFIDENCE):
    """Exact (Garwood) confidence interval for a Poisson count of cases."""
    alpha = 1 - confidence
    low = 0.0 if cases == 0 else chi2.ppf(alpha / 2, 2 * cases) / 2
    high = chi2.ppf(1 - alpha / 2, 2 * cases + 2) / 2
    return float(low), float(high)


def mid_rank_percentile(below, tied, total):
    """% of peers below, counting half of the ties (D-005)."""
    return (below + tied / 2) * 100 / total  # multiply first: 11.5 / 40 * 100 is 28.749999...


def verdict_for(percentile):
    for cutoff, verdict in VERDICTS:
        if percentile < cutoff:
            return verdict
    return 'very_high'


def ownership_q(ownership):
    if ownership == PRIVATE:
        return Q(establishment_type=PRIVATE_TYPE)
    if ownership == GOVERNMENT:
        return Q(establishment_type__in=GOVERNMENT_TYPES)
    return Q()


def resolve_year(requested):
    latest = CohortStats.objects.aggregate(year=Max('year'))['year']
    if latest is None:
        raise NoDataLoaded
    if requested is None:
        return latest
    if not CohortStats.objects.filter(year=requested).exists():
        raise YearNotLoaded(f'No OSHA data loaded for {requested}.')
    return requested


def find_cohort(year, ownership, naics_code):
    """The most specific NAICS level with at least MIN_COHORT_SIZE peers (D-009), or None."""
    wanted = Q()
    for level in COHORT_LEVELS:
        wanted |= Q(level=level, naics_prefix=naics_code[:level])
    by_level = {c.level: c for c in CohortStats.objects.filter(wanted, year=year, ownership=ownership)}
    for level in COHORT_LEVELS:
        cohort = by_level.get(level)
        if cohort and cohort.establishment_count >= MIN_COHORT_SIZE:
            return cohort
    return None


def histogram(peers, span):
    """Equal-width bins from 0 to `span`; the last bin collects everything above it."""
    width = next((w for w in HISTOGRAM_WIDTHS if span / w <= HISTOGRAM_MAX_BINS), HISTOGRAM_WIDTHS[-1])
    last = math.ceil(span / width)
    bucket = Least(
        Cast(Floor(F('trir') / Value(Decimal(str(width)), output_field=DecimalField())), IntegerField()),
        Value(last),
    )
    counts = dict(peers.annotate(bucket=bucket).values('bucket').annotate(n=Count('id')).values_list('bucket', 'n'))
    return {
        'bin_width': width,
        'bins': [
            {'start': i * width, 'end': None if i == last else (i + 1) * width, 'count': counts.get(i, 0)}
            for i in range(last + 1)
        ],
    }


def run_benchmark(naics_code, annual_average_employees, total_hours_worked, total_recordable_cases, ownership, year=None):
    year = resolve_year(year)
    hours = total_hours_worked
    cases = total_recordable_cases
    naics = normalize_naics(naics_code)
    warnings = []

    trir = incidence_rate(cases, hours)
    ci_low, ci_high = poisson_interval(cases)
    to_rate = RATE_BASE_HOURS / hours
    industry = NaicsIndustry.objects.filter(code=naics).first()

    if naics != naics_code:
        warnings.append({
            'code': 'naics_remapped',
            'message': f'NAICS {naics_code} is from an older edition. You are compared as {naics}, its 2022 code.',
        })
    if hours < MIN_HOURS_WORKED:
        warnings.append({
            'code': 'small_plant',
            'message': (
                f'With fewer than {MIN_HOURS_WORKED:,} hours worked, one recordable case adds '
                f'{to_rate:.1f} to your TRIR, so your rate can swing a lot from year to year.'
            ),
        })

    result = {
        'input': {
            'naics_code': naics,
            'naics_code_reported': naics_code,
            'annual_average_employees': annual_average_employees,
            'total_hours_worked': hours,
            'total_recordable_cases': cases,
            'ownership': ownership,
            'year': year,
        },
        'industry': {'code': naics, 'label': industry.label if industry else None},
        'plant': {
            'trir': float(trir),
            'trir_interval': {'low': round(ci_low * to_rate, 2), 'high': round(ci_high * to_rate, 2), 'confidence': CONFIDENCE},
            'one_case_adds': round(to_rate, 2),
            'hours_per_employee': round(hours / annual_average_employees),
        },
        'cohort': None,
        'rank': None,
        'comparison': None,
        'histogram': None,
        'warnings': warnings,
    }

    cohort = find_cohort(year, ownership, naics)
    plants = PEER_NOUNS[ownership]
    if cohort is None:
        warnings.append({
            'code': 'no_cohort',
            'message': (
                f'Fewer than {MIN_COHORT_SIZE} {plants} report NAICS {naics[:3]}, '
                'too few for a fair comparison. Your TRIR is shown without a percentile.'
            ),
        })
        return result

    if cohort.level < 6:
        warnings.append({
            'code': 'broader_cohort',
            'message': (
                f'Fewer than {MIN_COHORT_SIZE} {plants} report NAICS {naics}, so you are compared '
                f'with all {cohort.establishment_count:,} {plants} in NAICS {cohort.naics_prefix}.'
            ),
        })

    peers = Establishment.objects.filter(ownership_q(ownership), year=year, naics_code__startswith=cohort.naics_prefix)
    counts = peers.aggregate(
        total=Count('id'),
        below=Count('id', filter=Q(trir__lt=trir)),
        tied=Count('id', filter=Q(trir=trir)),
    )
    total, below, tied = counts['total'], counts['below'], counts['tied']
    percentile = mid_rank_percentile(below, tied, total)
    median = cohort.median_trir

    if ci_high * to_rate < median:
        differs = 'below'
    elif ci_low * to_rate > median:
        differs = 'above'
    else:
        differs = 'not_significant'

    result['cohort'] = {
        'year': year,
        'ownership': ownership,
        'level': cohort.level,
        'naics_prefix': cohort.naics_prefix,
        'establishment_count': total,
        'p25': round_or_none(cohort.p25_trir),
        'median': round_or_none(median),
        'p75': round_or_none(cohort.p75_trir),
        'p90': round_or_none(cohort.p90_trir),
        'pooled_trir': round_or_none(cohort.pooled_trir),
        'share_zero': round_or_none(cohort.share_zero, 4),
    }
    result['rank'] = {
        'percentile': round(percentile, 1),
        'below': below,
        'tied': tied,
        'above': total - below - tied,
    }
    result['comparison'] = {
        'difference_from_median': round(float(trir) - median, 2),
        'percent_from_median': round((float(trir) - median) / median * 100, 1) if median > 0 else None,
        'expected_cases_at_median': round(median * hours / RATE_BASE_HOURS, 2),
        'verdict': verdict_for(percentile),
        'differs_from_median': differs,
    }
    span = max(cohort.p90_trir * 1.5, float(trir) * 1.1, 1.0)
    result['histogram'] = histogram(peers, span)
    return result
