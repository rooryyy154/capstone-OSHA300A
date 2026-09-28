import time
from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import CohortStats, Establishment, NaicsIndustry
from core.rules import incidence_rate
from ingest import cleaning


def text(value, max_length):
    return '' if pd.isna(value) else str(value).strip()[:max_length]


class Command(BaseCommand):
    help = 'Load an OSHA ITA Form 300A CSV, print a data-quality report, and refresh cohort_stats.'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True, type=Path, help='Path to the ITA 300A CSV')
        parser.add_argument('--year', type=int, help='Calendar year to load (default: the only year in the file)')
        parser.add_argument('--dry-run', action='store_true', help='Print the quality report without touching the database')
        parser.add_argument('--batch-size', type=int, default=5_000)

    def handle(self, *args, **options):
        path = options['file']
        if not path.exists():
            raise CommandError(f'File not found: {path}')

        started = time.monotonic()
        self.stdout.write(f'Reading {path} ...')
        df, malformed = cleaning.read_csv(path)
        raw_rows = len(df) + len(malformed)

        year = self.pick_year(df, options['year'])
        other_years = df['year_filing_for'] != year
        df = df[~other_years.fillna(True)]

        df = cleaning.add_derived(df)
        reasons, rule_names = cleaning.drop_reasons(df)
        clean = df[reasons.isna()]
        self.print_report(path, year, raw_rows, len(malformed), int(other_years.sum()), df, reasons, rule_names, clean)

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Dry run: database not changed.'))
            return

        with transaction.atomic():
            # Replace the whole year so tightening a rule never leaves stale rows behind (D-002)
            deleted, _ = Establishment.objects.filter(year=year).delete()
            Establishment.objects.bulk_create(self.build_rows(clean, year), batch_size=options['batch_size'])

            labels = cleaning.industry_labels(clean)
            NaicsIndustry.objects.bulk_create(
                [NaicsIndustry(code=code, label=label[:255]) for code, label in labels.items()],
                update_conflicts=True,
                unique_fields=['code'],
                update_fields=['label'],
            )
            # Codes no loaded year uses anymore (e.g. after a rule change) leave the catalog
            NaicsIndustry.objects.exclude(code__in=Establishment.objects.values('naics_code')).delete()
            CohortStats.refresh()

        self.stdout.write(self.style.SUCCESS(
            f'Loaded {len(clean):,} establishments for {year} (replaced {deleted:,}), '
            f'{len(labels):,} NAICS codes in the catalog, cohort_stats refreshed '
            f'in {time.monotonic() - started:.0f}s.'
        ))

    def pick_year(self, df, requested):
        years = sorted(df['year_filing_for'].dropna().unique().tolist())
        if requested is not None:
            if requested not in years:
                raise CommandError(f'No rows for {requested}. Years in the file: {years}')
            return requested
        if len(years) != 1:
            raise CommandError(f'The file has several years {years}; choose one with --year.')
        return int(years[0])

    def build_rows(self, clean, year):
        for row in clean.itertuples(index=False):
            yield Establishment(
                year=year,
                establishment_id=row.establishment_id,
                establishment_name=text(row.establishment_name, 255),
                company_name=text(row.company_name, 255),
                city=text(row.city, 100),
                state=text(row.state, 2),
                naics_code=row.naics_code,
                naics_code_reported=row.naics_code_reported,
                naics_year=None if pd.isna(row.naics_year) else int(row.naics_year),
                industry_description=text(row.industry_description, 255),
                establishment_type=int(row.establishment_type),
                annual_average_employees=int(row.annual_average_employees),
                total_hours_worked=int(row.total_hours_worked),
                total_deaths=int(row.total_deaths),
                total_dafw_cases=int(row.total_dafw_cases),
                total_djtr_cases=int(row.total_djtr_cases),
                total_other_cases=int(row.total_other_cases),
                total_dafw_days=int(row.total_dafw_days),
                total_djtr_days=int(row.total_djtr_days),
                recordable_cases=int(row.recordable_cases),
                trir=incidence_rate(int(row.recordable_cases), int(row.total_hours_worked)),
                dart=incidence_rate(int(row.total_dafw_cases) + int(row.total_djtr_cases), int(row.total_hours_worked)),
            )

    def print_report(self, path, year, raw_rows, malformed, other_years, df, reasons, rule_names, clean):
        loaded = len(df)
        counts = reasons.value_counts()
        width = max(len(name) for name in rule_names) + 2

        lines = [
            '',
            f'Data-quality report: {path.name}, year {year}',
            '-' * (width + 22),
            f'{"Raw rows":<{width}}{raw_rows:>12,}',
            f'{"Malformed rows (D-001)":<{width}}{malformed:>12,}',
        ]
        if other_years:
            lines.append(f'{"Rows for other years":<{width}}{other_years:>12,}')
        lines += [f'{"Rows checked":<{width}}{loaded:>12,}', '', 'Dropped, by first rule failed:']
        for name in rule_names:
            dropped = int(counts.get(name, 0))
            lines.append(f'  {name:<{width - 2}}{dropped:>12,}{dropped / loaded:>9.2%}')
        total_dropped = int(reasons.notna().sum())
        lines += [
            f'  {"TOTAL DROPPED":<{width - 2}}{total_dropped:>12,}{total_dropped / loaded:>9.2%}',
            '',
            f'{"Accepted":<{width}}{len(clean):>12,}{len(clean) / loaded:>9.2%}',
        ]
        owners = clean['establishment_type'].map({1: 'private', 2: 'state government', 3: 'local government'})
        for owner, n in owners.value_counts().items():
            lines.append(f'  {owner:<{width - 2}}{n:>12,}')
        remapped = int((clean['naics_code'] != clean['naics_code_reported']).sum())
        lines += [f'{"NAICS remapped to 2022 (D-006)":<{width}}{remapped:>12,}', '']
        self.stdout.write('\n'.join(lines))
