from django.contrib import admin

from .models import PrecioProducto, Presentacion, Producto


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ("tipo_huevo", "tamano", "estado")
    list_filter = ("tipo_huevo", "tamano", "estado")


@admin.register(Presentacion)
class PresentacionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "cantidad_bandejas_equivalentes", "estado")
    list_filter = ("estado",)


@admin.register(PrecioProducto)
class PrecioProductoAdmin(admin.ModelAdmin):
    list_display = ("producto", "presentacion", "precio", "fecha_desde", "fecha_hasta")
    list_filter = ("producto", "presentacion")