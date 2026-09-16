"""Shared helpers for loading the OSHA ITA 300A summary CSV in the analysis notebooks.

The Django `load_ita` command will reimplement the rules that come out of these
notebooks. This module only covers what every notebook needs: a consistent load.
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / 'data' / 'raw'

ID_COLUMNS = {
    'id': 'string',
    'establishment_id': 'string',
    'ein': 'string',
    'zip_code': 'string',
    'naics_code': 'string',
}

CASE_COLUMNS = ['total_deaths', 'total_dafw_cases', 'total_djtr_cases', 'total_other_cases']

HOURS_PER_RATE_BASE = 200_000  # 100 full-time employees × 2,000 hours


def load_raw(year=2025):
    """Read the raw CSV, drop the malformed rows (decision D-001), and fix column types.

    Returns (df, malformed) where `malformed` holds the rows that were excluded.
    """
    df = pd.read_csv(RAW_DIR / f'ita_300a_{year}.csv', dtype=ID_COLUMNS, low_memory=False)

    # Records split across two lines leave an empty id or empty numeric columns
    is_malformed = df['id'].isna() | df['total_hours_worked'].isna()
    malformed = df[is_malformed].copy()
    df = df[~is_malformed].copy()

    count_columns = df.columns[df.columns.get_loc('size'):df.columns.get_loc('total_other_illnesses') + 1]
    df[count_columns] = df[count_columns].apply(pd.to_numeric, errors='raise').astype('Int64')
    for col in ['naics_year', 'establishment_type', 'year_filing_for']:
        df[col] = pd.to_numeric(df[col]).astype('Int64')

    return df, malformed


def add_derived(df):
    """Add recordable cases, TRIR, DART, hours per employee, and NAICS prefixes."""
    df = df.copy()
    hours = df['total_hours_worked'].astype(float)
    employees = df['annual_average_employees'].astype(float)

    df['recordable_cases'] = df[CASE_COLUMNS].sum(axis=1)
    valid_hours = hours > 0

    df['trir'] = np.where(valid_hours, df['recordable_cases'].astype(float) * HOURS_PER_RATE_BASE / hours, np.nan)
    df['dart'] = np.where(
        valid_hours,
        (df['total_dafw_cases'] + df['total_djtr_cases']).astype(float) * HOURS_PER_RATE_BASE / hours,
        np.nan,
    )
    df['hours_per_employee'] = np.where(valid_hours & (employees > 0), hours / employees, np.nan)

    df['naics_6'] = df['naics_code'].where(df['naics_code'].str.fullmatch(r'\d{6}'))
    df['naics_4'] = df['naics_6'].str[:4]
    df['naics_3'] = df['naics_6'].str[:3]
    df['naics_2'] = df['naics_6'].str[:2]
    return df
