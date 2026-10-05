import pandas as pd
from django.test import SimpleTestCase

from ingest.cleaning import COUNT_COLUMNS, add_derived, drop_reasons, industry_labels

GOOD = {
    'naics_code': '332710',
    'establishment_type': 1,
    'industry_description': 'Machine shops',
    'annual_average_employees': 50,
    'total_hours_worked': 100_000,
    'total_deaths': 0,
    'total_dafw_cases': 1,
    'total_djtr_cases': 0,
    'total_other_cases': 1,
    'total_dafw_days': 5,
    'total_djtr_days': 0,
}


def frame(*rows):
    df = pd.DataFrame([{**GOOD, **row} for row in rows])
    df[COUNT_COLUMNS] = df[COUNT_COLUMNS].astype('Int64')
    df['establishment_type'] = df['establishment_type'].astype('Int64')
    df['naics_code'] = df['naics_code'].astype('string')
    return add_derived(df)


class DropRuleTests(SimpleTestCase):
    def test_each_row_gets_the_first_rule_it_fails(self):
        df = frame(
            {},
            {'total_hours_worked': 0},
            {'naics_code': '999999'},
            {'establishment_type': None, 'total_hours_worked': 5_000},  # fails two rules
            {'total_hours_worked': 5_000},
            {'annual_average_employees': 5, 'total_hours_worked': 50_000},  # 10,000 h/employee
            {'annual_average_employees': 100, 'total_hours_worked': 20_000},  # 200 h/employee
            {'annual_average_employees': 10, 'total_hours_worked': 20_000, 'total_other_cases': 11},
        )
        reasons, _ = drop_reasons(df)
        self.assertEqual(reasons.fillna('accepted').tolist(), [
            'accepted',
            'hours worked <= 0',
            'invalid NAICS code (D-008)',
            'missing establishment type (D-007)',
            'hours worked < 10,000 (D-003)',
            'hours per employee > 8,760 (D-004)',
            'hours per employee < 250 (D-004)',
            'cases > average employees (D-008)',
        ])

    def test_derived_columns(self):
        df = frame({'naics_code': '452210'})
        row = df.iloc[0]
        self.assertEqual(row['recordable_cases'], 2)
        self.assertEqual(row['hours_per_employee'], 2_000)
        self.assertEqual((row['naics_code'], row['naics_code_reported']), ('455110', '452210'))

    def test_labels_prefer_plants_that_reported_the_2022_code(self):
        df = frame(
            {'naics_code': '446110', 'industry_description': 'Drug stores'},
            {'naics_code': '446110', 'industry_description': 'Drug stores'},
            {'naics_code': '456110', 'industry_description': '456110 Pharmacies and Drug Retailers'},
        )
        self.assertEqual(industry_labels(df).to_dict(), {'456110': 'Pharmacies and Drug Retailers'})

    def test_official_titles_win_over_reported_descriptions(self):
        df = frame({'naics_code': '444240', 'industry_description': 'General Merchandise Stores'})
        self.assertEqual(industry_labels(df).to_dict(), {'444240': 'Nursery, Garden Center, and Farm Supply Retailers'})
