from rest_framework import serializers

from core.naics import is_valid_naics
from core.rules import (
    DEFAULT_OWNERSHIP,
    MAX_HOURS_PER_EMPLOYEE,
    MIN_HOURS_PER_EMPLOYEE,
    OWNERSHIP_CHOICES,
)


class BenchmarkInputSerializer(serializers.Serializer):
    """The four Form 300A numbers, plus the peer-group filter (D-007).

    Cross-field checks mirror the ingestion rules (D-004, D-008): a plant we would have dropped
    from OSHA's data can't be benchmarked against it either.
    """

    naics_code = serializers.RegexField(
        r'^\d{6}$',
        error_messages={'invalid': 'Enter a 6-digit NAICS code.'},
    )
    annual_average_employees = serializers.IntegerField(min_value=1)
    total_hours_worked = serializers.IntegerField(min_value=1, max_value=10**12)
    total_recordable_cases = serializers.IntegerField(min_value=0)
    ownership = serializers.ChoiceField(choices=OWNERSHIP_CHOICES, default=DEFAULT_OWNERSHIP)
    year = serializers.IntegerField(required=False, min_value=2000, max_value=2100)

    def validate_naics_code(self, value):
        if not is_valid_naics(value):
            raise serializers.ValidationError(f'{value} is not a valid NAICS industry code.')
        return value

    def validate(self, data):
        employees = data['annual_average_employees']
        hours = data['total_hours_worked']
        hours_per_employee = hours / employees

        if not MIN_HOURS_PER_EMPLOYEE <= hours_per_employee <= MAX_HOURS_PER_EMPLOYEE:
            raise serializers.ValidationError({
                'total_hours_worked': (
                    f'That is {hours_per_employee:,.0f} hours per employee. It must be between '
                    f'{MIN_HOURS_PER_EMPLOYEE:,} and {MAX_HOURS_PER_EMPLOYEE:,}; check hours worked and employees.'
                ),
            })
        if data['total_recordable_cases'] > employees:
            raise serializers.ValidationError({
                'total_recordable_cases': 'Recordable cases cannot be more than the annual average number of employees.',
            })
        return data
