from django.contrib import admin

from .models import (
    CuentaCorriente,
    DetalleVenta,
    DetalleVentaMovimiento,
    PagoCuenta,
    PagoCuentaMovCaja,
    PagoVenta,
    PagoVentaMovCaja,
    Venta,
)


class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 1


class PagoVentaInline(admin.TabularInline):
    model = PagoVenta
    extra = 1


class PagoCuentaInline(admin.TabularInline):
    model = PagoCuenta
    extra = 0


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ("id_venta", "fecha", "modalidad", "cliente", "total", "usuario")
    list_filter = ("modalidad",)
    date_hierarchy = "fecha"
    inlines = [DetalleVentaInline, PagoVentaInline]


@admin.register(CuentaCorriente)
class CuentaCorrienteAdmin(admin.ModelAdmin):
    list_display = ("id_cuenta", "venta", "importe_original", "saldo_pendiente", "estado")
    list_filter = ("estado",)
    inlines = [PagoCuentaInline]


admin.site.register(DetalleVentaMovimiento)
admin.site.register(PagoVentaMovCaja)
admin.site.register(PagoCuentaMovCaja)