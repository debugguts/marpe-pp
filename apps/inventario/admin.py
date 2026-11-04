from django.contrib import admin

from .models import MovimientoInventario, Stock


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ("producto", "cantidad_bandejas", "stock_minimo_bandejas", "fecha_actualizacion")


@admin.register(MovimientoInventario)
class MovimientoInventarioAdmin(admin.ModelAdmin):
    list_display = ("fecha_hora", "producto", "tipo_movimiento", "cantidad_bandejas", "usuario", "motivo")
    list_filter = ("tipo_movimiento", "producto")
    date_hierarchy = "fecha_hora"