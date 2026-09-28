from django.contrib import admin

from .models import CohortStats, Establishment, NaicsIndustry


@admin.register(Establishment)
class EstablishmentAdmin(admin.ModelAdmin):
    list_display = ['establishment_name', 'state', 'naics_code', 'establishment_type', 'total_hours_worked', 'recordable_cases', 'trir', 'year']
    list_filter = ['year', 'establishment_type', 'state']
    search_fields = ['establishment_name', 'company_name', 'naics_code']
    show_full_result_count = False


@admin.register(NaicsIndustry)
class NaicsIndustryAdmin(admin.ModelAdmin):
    list_display = ['code', 'label']
    search_fields = ['code', 'label']


@admin.register(CohortStats)
class CohortStatsAdmin(admin.ModelAdmin):
    list_display = ['naics_prefix', 'level', 'ownership', 'year', 'establishment_count', 'median_trir', 'share_zero']
    list_filter = ['year', 'ownership', 'level']
    search_fields = ['naics_prefix']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
