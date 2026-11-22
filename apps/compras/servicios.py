"""Compras (HU-04): registrar, modificar y anular. Mueven el stock, así que todo va en una transacción."""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventario.models import MovimientoInventario
from apps.inventario.servicios import a_bandejas, mover_stock
from apps.proveedores.models import CostoProveedor
from config.formato import bandejas as texto_bandejas
from config.formato import pesos

from .models import Compra, DetalleCompra, DetalleCompraMovimiento

SIN_STOCK = ("No alcanza el stock para deshacer esta compra: "
             "parte de esos huevos ya se vendió o se dio de baja.")


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


def cargar_detalles(compra, lineas, usuario):
    """Guarda las líneas de la compra, suma los huevos al stock y recalcula el total."""
    compra.total = Decimal("0")
    for linea in lineas:
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


def registrar_compra(datos, usuario):
    """Se llama dentro de una transacción: si algo falla, no queda nada a medias."""
    compra = Compra.objects.create(
        proveedor=datos["proveedor"], fecha=datos.get("fecha") or date.today(),
        total=Decimal("0"), usuario=usuario,
    )
    cargar_detalles(compra, datos["detalles"], usuario)
    return compra


# ---------- Modificación y anulación ----------

def controlar_que_se_pueda_cambiar(compra):
    if compra.estado == Compra.Estado.ANULADA:
        raise ValidationError({"non_field_errors": "Esta compra está anulada: no se puede modificar ni volver a anular."})


def bandejas_sumadas(compra):
    """Cuántas bandejas sumó al stock cada producto de la compra (se leen de sus movimientos)."""
    por_producto = defaultdict(Decimal)
    productos = {}
    enlaces = (DetalleCompraMovimiento.objects.filter(detalle_compra__compra=compra)
               .select_related("detalle_compra__producto", "movimiento_inventario"))
    for enlace in enlaces:
        producto = enlace.detalle_compra.producto
        productos[producto.pk] = producto
        por_producto[producto.pk] += enlace.movimiento_inventario.cantidad_bandejas
    return [(productos[pk], bandejas) for pk, bandejas in por_producto.items()]


def sacar_del_stock(sumadas, usuario, motivo):
    """Saca con un ajuste negativo lo que había sumado la compra. Si ya no está, corta."""
    try:
        for producto, bandejas in sumadas:
            mover_stock(producto, bandejas, MovimientoInventario.Tipo.AJUSTE_NEGATIVO, usuario, motivo[:200])
    except ValidationError:
        raise ValidationError({"non_field_errors": SIN_STOCK}) from None


def resumen(compra):
    """Texto con lo esencial de la compra, para dejar constancia en el registro de actividad."""
    lineas = "; ".join(
        f"{texto_bandejas(d.cantidad)} {d.presentacion.nombre} {d.producto} a {pesos(d.precio_unitario)}"
        for d in compra.detalles.select_related("producto", "presentacion")
    )
    return f"{compra.proveedor.nombre} · {compra.fecha:%d/%m/%Y} · {lineas} · total {pesos(compra.total)}"


@transaction.atomic
def modificar_compra(compra, datos, usuario):
    """Reemplaza el contenido de la compra. Devuelve (compra, como_estaba) para la actividad.

    Primero carga la versión nueva (suma stock) y después saca lo que había sumado la anterior:
    así, si solo cambia el precio o la fecha, funciona aunque esos huevos ya se hayan vendido.
    """
    controlar_que_se_pueda_cambiar(compra)
    como_estaba = resumen(compra)
    anteriores = bandejas_sumadas(compra)

    # Se quita el detalle anterior. Los movimientos de stock NO se borran: quedan con su contrapartida.
    DetalleCompraMovimiento.objects.filter(detalle_compra__compra=compra).delete()
    compra.detalles.all().delete()

    compra.proveedor = datos["proveedor"]
    compra.fecha = datos.get("fecha") or compra.fecha
    compra.fecha_modificacion = timezone.now()
    compra.save(update_fields=["proveedor", "fecha", "fecha_modificacion"])
    cargar_detalles(compra, datos["detalles"], usuario)
    sacar_del_stock(anteriores, usuario, f"Modificación de la compra {compra.pk}")
    return compra, como_estaba


@transaction.atomic
def anular_compra(compra, motivo, usuario):
    """La compra no se borra: queda ANULADA con su motivo y sus huevos salen del stock."""
    controlar_que_se_pueda_cambiar(compra)
    sacar_del_stock(bandejas_sumadas(compra), usuario, f"Anulación de la compra {compra.pk}: {motivo}")
    compra.estado = Compra.Estado.ANULADA
    compra.motivo_anulacion = motivo
    compra.fecha_anulacion = timezone.now()
    compra.save(update_fields=["estado", "motivo_anulacion", "fecha_anulacion"])
    return compra
