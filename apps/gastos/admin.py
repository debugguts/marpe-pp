from django.contrib import admin

from .models import Gasto, GastoMovCaja


@admin.register(Gasto)
class GastoAdmin(admin.ModelAdmin):
    list_display = ("fecha", "concepto", "categoria", "importe", "medio_pago", "usuario")
    list_filter = ("categoria", "medio_pago")
    date_hierarchy = "fecha"


admin.site.register(GastoMovCaja)