"""Registrar una compra (HU-04): guarda la compra, su detalle y suma los huevos al stock."""

from datetime import date
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from apps.inventario.models import MovimientoInventario
from apps.inventario.servicios import a_bandejas, mover_stock
from apps.proveedores.models import CostoProveedor

from .models import Compra, DetalleCompra, DetalleCompraMovimiento


def costo_vigente(proveedor, producto, presentacion):
    """El precio que tiene cargado el proveedor hoy para ese producto y presentación (HU-03-D)."""
    costo = CostoProveedor.objects.filter(
        proveedor=proveedor, producto=producto, presentacion=presentacion, fecha_hasta__isnull=True
    ).first()
    if costo is None:
        raise ValidationError({"non_field_errors": (
            f"{proveedor} no tiene costo cargado para {producto} en {presentacion}: "
            "indicá el precio en la línea o cargalo en el proveedor."
        )})
    return costo.precio_costo


def registrar_compra(datos, usuario):
    """Se llama dentro de una transacción: si algo falla, no queda nada a medias."""
    compra = Compra.objects.create(
        proveedor=datos["proveedor"], fecha=datos.get("fecha") or date.today(),
        total=Decimal("0"), usuario=usuario,
    )
    for linea in datos["detalles"]:
        producto, presentacion, cantidad = linea["producto"], linea["presentacion"], linea["cantidad"]
        precio = linea.get("precio_unitario") or costo_vigente(compra.proveedor, producto, presentacion)
        detalle = DetalleCompra.objects.create(
            compra=compra, producto=producto, presentacion=presentacion, cantidad=cantidad,
            precio_unitario=precio, subtotal=(cantidad * precio).quantize(Decimal("0.01")),
        )
        movimiento = mover_stock(
            producto, a_bandejas(cantidad, presentacion),
            MovimientoInventario.Tipo.INGRESO_COMPRA, usuario,
        )
        DetalleCompraMovimiento.objects.create(detalle_compra=detalle, movimiento_inventario=movimiento)
        compra.total += detalle.subtotal
    compra.save(update_fields=["total"])
    return compra
