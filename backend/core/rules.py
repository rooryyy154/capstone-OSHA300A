"""Data-quality rules and benchmark settings.

Each constant cites its entry in docs/decisions.md. Ingestion (ingest/cleaning.py) and the
API (api/serializers.py, api/benchmark.py) both import from here, so the rules applied to
OSHA's data and to the user's own numbers can never drift apart.
"""

from decimal import ROUND_HALF_UP, Decimal

# 200,000 hours = 100 full-time employees x 40 hours x 50 weeks (OSHA's rate base)
RATE_BASE_HOURS = 200_000

# D-003: below this, a single case moves TRIR by more than 20 points
MIN_HOURS_WORKED = 10_000

# D-004: plausible average hours per employee (8,760 = 24 h x 365 days)
MIN_HOURS_PER_EMPLOYEE = 250
MAX_HOURS_PER_EMPLOYEE = 8_760

# D-009: smallest peer group that gets a percentile, and the NAICS levels tried in order
MIN_COHORT_SIZE = 30
COHORT_LEVELS = (6, 4, 3)

# D-007: OSHA establishment_type codes and the peer-group filters built on them
PRIVATE_TYPE = 1
GOVERNMENT_TYPES = (2, 3)  # state, local
ESTABLISHMENT_TYPE_CHOICES = [(1, 'Private'), (2, 'State government'), (3, 'Local government')]

PRIVATE = 'private'
GOVERNMENT = 'government'
ALL = 'all'
OWNERSHIP_CHOICES = [
    (PRIVATE, 'Private establishments only'),
    (GOVERNMENT, 'State and local government only'),
    (ALL, 'All establishments'),
]
DEFAULT_OWNERSHIP = PRIVATE

TWO_PLACES = Decimal('0.01')


def incidence_rate(cases, hours):
    """Cases per 200,000 hours, rounded half-up to 2 decimals the way OSHA reports it.

    Stored rates and the user's rate go through this same function, so equal inputs give
    exactly equal Decimals and ties are counted correctly in the percentile (D-005).
    """
    return (Decimal(cases) * RATE_BASE_HOURS / Decimal(hours)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
