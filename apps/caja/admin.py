from django.contrib import admin

from .models import Caja, MovimientoCaja


@admin.register(Caja)
class CajaAdmin(admin.ModelAdmin):
    list_display = ("id_caja", "estado", "fecha_hora_apertura", "saldo_inicial", "fecha_hora_cierre", "diferencia")
    list_filter = ("estado",)


@admin.register(MovimientoCaja)
class MovimientoCajaAdmin(admin.ModelAdmin):
    list_display = ("fecha_hora", "caja", "tipo_movimiento", "importe", "usuario")
    list_filter = ("tipo_movimiento",)
    date_hierarchy = "fecha_hora"