from django.contrib import admin

from .models import ContactMessage


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    """Read-only: messages arrive through the form, never through the admin."""

    list_display = ['email', 'status', 'attempts', 'created_at', 'expires_at']
    list_filter = ['status']
    search_fields = ['email']
    readonly_fields = ['id', 'email', 'message', 'status', 'attempts', 'created_at', 'expires_at']
    exclude = ['code_hash']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
