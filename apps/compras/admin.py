from django.contrib import admin

from .models import Compra, DetalleCompra, DetalleCompraMovimiento


class DetalleCompraInline(admin.TabularInline):
    model = DetalleCompra
    extra = 1


@admin.register(Compra)
class CompraAdmin(admin.ModelAdmin):
    list_display = ("id_compra", "fecha", "proveedor", "total", "usuario")
    list_filter = ("proveedor",)
    date_hierarchy = "fecha"
    inlines = [DetalleCompraInline]


admin.site.register(DetalleCompraMovimiento)