from decimal import Decimal
from itertools import count
from unittest import mock

from django.db import OperationalError
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from core.models import CohortStats, Establishment, NaicsIndustry
from core.naics import is_valid_naics, normalize_naics
from core.rules import incidence_rate

from .benchmark import mid_rank_percentile, poisson_interval, verdict_for

_ids = count()


def plant(naics, cases, hours=100_000, establishment_type=1, year=2025):
    return Establishment(
        year=year,
        establishment_id=str(next(_ids)),
        establishment_name='Test plant',
        state='CA',
        naics_code=naics,
        naics_code_reported=naics,
        establishment_type=establishment_type,
        annual_average_employees=50,
        total_hours_worked=hours,
        total_deaths=0,
        total_dafw_cases=0,
        total_djtr_cases=0,
        total_other_cases=cases,
        total_dafw_days=0,
        total_djtr_days=0,
        recordable_cases=cases,
        trir=incidence_rate(cases, hours),
        dart=Decimal('0'),
    )


def form(**overrides):
    data = {
        'naics_code': '332710',
        'annual_average_employees': 50,
        'total_hours_worked': 100_000,
        'total_recordable_cases': 0,
    }
    return {**data, **overrides}


class CalculationTests(SimpleTestCase):
    def test_incidence_rate_rounds_half_up(self):
        self.assertEqual(incidence_rate(4, 240_000), Decimal('3.33'))
        self.assertEqual(incidence_rate(1, 1_600_000), Decimal('0.13'))  # 0.125 -> 0.13, not 0.12

    def test_poisson_interval_matches_exact_values(self):
        low, high = poisson_interval(4)
        self.assertAlmostEqual(low, 1.090, places=3)
        self.assertAlmostEqual(high, 10.242, places=3)
        self.assertEqual(poisson_interval(0)[0], 0.0)

    def test_mid_rank_counts_half_the_ties(self):
        self.assertEqual(mid_rank_percentile(below=10, tied=20, total=100), 20.0)

    def test_verdict_cut_points(self):
        self.assertEqual(verdict_for(24.9), 'low')
        self.assertEqual(verdict_for(25), 'typical')
        self.assertEqual(verdict_for(75), 'high')
        self.assertEqual(verdict_for(90), 'very_high')

    def test_naics_rules(self):
        self.assertEqual(normalize_naics('452210'), '455110')
        self.assertEqual(normalize_naics('332710'), '332710')
        self.assertTrue(is_valid_naics('332710'))
        self.assertFalse(is_valid_naics('999999'))  # no sector 99
        self.assertFalse(is_valid_naics('332700'))  # padded subsector, not an industry


class BenchmarkApiTests(TestCase):
    """Peer data for 2025: 332710 has 40 private plants (10 at TRIR 0, then 2, 4, ... 60) and 35
    government plants at TRIR 10. 332720 has only 10 private plants, so it falls back to 3327.
    An older year, 2024, has 30 private 332710 plants at TRIR 2."""

    @classmethod
    def setUpTestData(cls):
        rows = [plant('332710', 0) for _ in range(10)]
        rows += [plant('332710', cases) for cases in range(1, 31)]
        rows += [plant('332710', 5, establishment_type=3) for _ in range(35)]
        rows += [plant('332720', 1) for _ in range(10)]
        rows += [plant('332710', 1, year=2024) for _ in range(30)]
        Establishment.objects.bulk_create(rows)
        NaicsIndustry.objects.create(code='332710', label='Machine shops')
        CohortStats.refresh()

    def post(self, data):
        return APIClient().post('/api/benchmark/', data, format='json')

    def test_years_lists_loaded_years_newest_first(self):
        body = APIClient().get('/api/years/').json()
        self.assertEqual(body, {'years': [2025, 2024], 'latest': 2025})

    def test_each_year_has_its_own_peers(self):
        latest = self.post(form()).json()
        older = self.post(form(year=2024)).json()
        self.assertEqual((latest['input']['year'], latest['cohort']['establishment_count']), (2025, 40))
        self.assertEqual((older['input']['year'], older['cohort']['establishment_count']), (2024, 30))
        self.assertEqual(older['cohort']['median'], 2.0)
        search = APIClient().get('/api/industries/', {'q': '332710', 'year': 2024}).json()
        self.assertEqual(search[0]['establishment_count'], 30)
        self.assertEqual(APIClient().get('/api/insights/', {'year': 2024}).json()['totals']['establishments'], 30)

    def test_zero_cases_ties_with_the_zero_group(self):
        body = self.post(form()).json()
        self.assertEqual(body['cohort']['establishment_count'], 40)
        self.assertEqual(body['rank'], {'percentile': 12.5, 'below': 0, 'tied': 10, 'above': 30})
        self.assertEqual(body['comparison']['verdict'], 'low')
        self.assertEqual(body['industry']['label'], 'Machine shops')

    def test_percentile_is_exact_for_a_rate_in_the_middle(self):
        body = self.post(form(total_recordable_cases=2)).json()  # TRIR 4.00
        self.assertEqual(body['plant']['trir'], 4.0)
        self.assertEqual(body['rank'], {'percentile': 28.8, 'below': 11, 'tied': 1, 'above': 28})
        self.assertEqual(body['comparison']['expected_cases_at_median'], body['cohort']['median'] / 2)

    def test_ownership_filter_changes_the_peer_group(self):
        government = self.post(form(ownership='government')).json()
        everyone = self.post(form(ownership='all')).json()
        self.assertEqual(government['cohort']['establishment_count'], 35)
        self.assertEqual(government['cohort']['median'], 10.0)
        self.assertEqual(everyone['cohort']['establishment_count'], 75)

    def test_small_cohort_falls_back_to_four_digits(self):
        body = self.post(form(naics_code='332720')).json()
        self.assertEqual((body['cohort']['level'], body['cohort']['naics_prefix']), (4, '3327'))
        self.assertEqual(body['cohort']['establishment_count'], 50)
        self.assertIn('broader_cohort', [w['code'] for w in body['warnings']])

    def test_no_cohort_still_returns_the_rate(self):
        body = self.post(form(naics_code='311111', total_recordable_cases=1)).json()
        self.assertEqual(body['plant']['trir'], 2.0)
        self.assertIsNone(body['cohort'])
        self.assertIn('no_cohort', [w['code'] for w in body['warnings']])

    def test_old_retail_code_is_remapped(self):
        body = self.post(form(naics_code='452210')).json()
        self.assertEqual(body['input']['naics_code'], '455110')
        self.assertIn('naics_remapped', [w['code'] for w in body['warnings']])

    def test_small_plant_warning(self):
        body = self.post(form(annual_average_employees=3, total_hours_worked=6_000)).json()
        self.assertIn('small_plant', [w['code'] for w in body['warnings']])

    def test_histogram_covers_every_peer(self):
        body = self.post(form(total_recordable_cases=3)).json()
        bins = body['histogram']['bins']
        self.assertEqual(sum(b['count'] for b in bins), 40)
        self.assertIsNone(bins[-1]['end'])

    def test_validation_errors(self):
        cases = {
            'naics_code': form(naics_code='999999'),
            'total_hours_worked': form(total_hours_worked=1_000),  # 20 hours per employee
            'total_recordable_cases': form(total_recordable_cases=51),
        }
        for field, data in cases.items():
            response = self.post(data)
            self.assertEqual(response.status_code, 400)
            self.assertIn(field, response.json())

    def test_unknown_year(self):
        response = self.post(form(year=2019))
        self.assertEqual(response.status_code, 400)

    def test_insights_pool_rates_by_hours(self):
        body = APIClient().get('/api/insights/').json()
        # 30 private plants with 1..30 cases and 10 with 0 = 465 cases; 10 plants with 1 case; all 100,000 hours
        manufacturing = next(s for s in body['sectors'] if s['code'] == '31-33')
        self.assertEqual(manufacturing['title'], 'Manufacturing')
        self.assertEqual(manufacturing['establishments'], 50)
        self.assertEqual(manufacturing['trir'], round(475 * 200_000 / 5_000_000, 2))
        self.assertEqual(body['totals']['establishments'], 85)
        self.assertEqual([o['ownership'] for o in body['ownership']], ['private', 'local_government'])

    def test_industry_search(self):
        response = APIClient().get('/api/industries/', {'q': 'machine'})
        self.assertEqual(response.json(), [{'code': '332710', 'label': 'Machine shops', 'establishment_count': 75}])


class EmptyDatabaseTests(TestCase):
    def test_benchmark_before_any_load(self):
        response = APIClient().post('/api/benchmark/', form(), format='json')
        self.assertEqual(response.status_code, 503)


class ErrorResponseTests(SimpleTestCase):
    """Unexpected failures come back as JSON status codes, not Django's HTML error page."""

    def post(self):
        return APIClient().post('/api/benchmark/', form(), format='json')

    def test_database_down_is_503(self):
        with mock.patch('api.views.run_benchmark', side_effect=OperationalError('connection refused')):
            with self.assertLogs('api.exceptions', 'ERROR'):
                response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'detail': 'The database is unavailable.'})

    def test_unexpected_error_is_500(self):
        with mock.patch('api.views.run_benchmark', side_effect=RuntimeError('bug')):
            with self.assertLogs('api.exceptions', 'ERROR'):
                response = self.post()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {'detail': 'Internal server error.'})
