from django.contrib import admin

from .models import CONSUMIDOR_FINAL_ID, Cliente


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "telefono", "estado")
    list_filter = ("estado",)
    search_fields = ("nombre",)

    def has_delete_permission(self, request, obj=None):
        if obj is not None and obj.pk == CONSUMIDOR_FINAL_ID:
            return False
        return super().has_delete_permission(request, obj)