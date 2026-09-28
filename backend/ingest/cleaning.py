"""Cleaning pipeline for the OSHA ITA Form 300A CSV.

Pure pandas, no database access, so it can be tested on small frames. The thresholds live in
core/rules.py and every rule is justified in docs/decisions.md.
"""

import pandas as pd

from core.naics import is_valid_naics, normalize_naics
from core.rules import (
    MAX_HOURS_PER_EMPLOYEE,
    MIN_HOURS_PER_EMPLOYEE,
    MIN_HOURS_WORKED,
)

# Read identifiers as text so leading zeros survive (ZIP codes, EINs, NAICS)
TEXT_COLUMNS = {
    'id': 'string',
    'establishment_id': 'string',
    'ein': 'string',
    'zip_code': 'string',
    'naics_code': 'string',
}

COUNT_COLUMNS = [
    'annual_average_employees',
    'total_hours_worked',
    'total_deaths',
    'total_dafw_cases',
    'total_djtr_cases',
    'total_other_cases',
    'total_dafw_days',
    'total_djtr_days',
]
CASE_COLUMNS = ['total_deaths', 'total_dafw_cases', 'total_djtr_cases', 'total_other_cases']
CODE_COLUMNS = ['naics_year', 'establishment_type', 'year_filing_for']


def read_csv(path):
    """Read the raw CSV and set aside malformed rows (D-001).

    Returns (df, malformed). Records that OSHA's export split across two lines leave an empty
    `id` or empty numeric columns; they can't be repaired reliably, so they are excluded.
    """
    df = pd.read_csv(path, dtype=TEXT_COLUMNS, low_memory=False)

    is_malformed = df['id'].isna() | df['total_hours_worked'].isna()
    malformed = df[is_malformed].copy()
    df = df[~is_malformed].copy()

    df[COUNT_COLUMNS] = df[COUNT_COLUMNS].apply(pd.to_numeric, errors='raise').astype('Int64')
    df[CODE_COLUMNS] = df[CODE_COLUMNS].apply(pd.to_numeric, errors='coerce').astype('Int64')
    return df, malformed


def add_derived(df):
    df = df.copy()
    hours = df['total_hours_worked'].astype('float64')
    employees = df['annual_average_employees'].astype('float64')

    df['recordable_cases'] = df[CASE_COLUMNS].sum(axis=1)
    df['hours_per_employee'] = (hours / employees).where((hours > 0) & (employees > 0))
    df['naics_code_reported'] = df['naics_code']
    df['naics_code'] = df['naics_code'].map(normalize_naics, na_action='ignore')  # D-006
    return df


def drop_rules(df):
    """The ordered drop rules. Each row is dropped for the FIRST rule it fails."""
    hours_per_employee = df['hours_per_employee']
    counts_negative = (df[COUNT_COLUMNS] < 0).any(axis=1)
    return [
        ('negative counts', counts_negative),
        ('hours worked <= 0', df['total_hours_worked'] <= 0),
        ('average employees <= 0', df['annual_average_employees'] <= 0),
        ('invalid NAICS code (D-008)', ~df['naics_code_reported'].fillna('').map(is_valid_naics)),
        ('missing establishment type (D-007)', ~df['establishment_type'].isin([1, 2, 3])),
        (f'hours worked < {MIN_HOURS_WORKED:,} (D-003)', df['total_hours_worked'] < MIN_HOURS_WORKED),
        (f'hours per employee > {MAX_HOURS_PER_EMPLOYEE:,} (D-004)', hours_per_employee > MAX_HOURS_PER_EMPLOYEE),
        (f'hours per employee < {MIN_HOURS_PER_EMPLOYEE:,} (D-004)', hours_per_employee < MIN_HOURS_PER_EMPLOYEE),
        ('cases > average employees (D-008)', df['recordable_cases'] > df['annual_average_employees']),
    ]


def drop_reasons(df):
    """Label every row with the first rule it fails (<NA> means the row is accepted).

    Returns (reasons, rule_names) so the report can list rules in order, including those
    that dropped nothing.
    """
    rules = drop_rules(df)
    reasons = pd.Series(pd.NA, index=df.index, dtype='string')
    for name, mask in rules:
        mask = pd.Series(mask, index=df.index).fillna(False).astype(bool)
        reasons = reasons.mask(reasons.isna() & mask, name)
    return reasons, [name for name, _ in rules]


def industry_labels(clean):
    """A label per 2022 NAICS code: the description plants report most often.

    Prefers plants that reported the 2022 code themselves, since plants remapped from an older
    code describe the older industry. Descriptions that are just the code are ignored.
    """
    description = (
        clean['industry_description']
        .fillna('')
        .astype(str)
        .str.strip()
        .str.replace(r'^\d{6}\s*[-:]?\s*', '', regex=True)
    )
    frame = pd.DataFrame({
        'code': clean['naics_code'],
        'native': clean['naics_code'] == clean['naics_code_reported'],
        'description': description,
    })
    frame = frame[frame['description'].str.contains(r'[A-Za-z]', regex=True)]

    def most_common(values):
        return values.value_counts().index[0]

    native = frame[frame['native']].groupby('code')['description'].agg(most_common)
    fallback = frame.groupby('code')['description'].agg(most_common)
    labels = native.combine_first(fallback)
    return labels.reindex(clean['naics_code'].unique()).fillna('(no description reported)')
