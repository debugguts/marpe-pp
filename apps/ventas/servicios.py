"""Registrar una venta (HU-05).

1) Toma el precio vigente de cada producto y lo guarda en la venta (no cambia aunque después suba).
2) Descuenta los huevos del stock (si no alcanza, no se vende nada).
3) Contado: registra el pago; si es en efectivo, entra a la caja.
   Fiado: abre la deuda en la cuenta corriente del cliente.
"""

from decimal import Decimal

from rest_framework.exceptions import ValidationError

from apps.caja.models import MovimientoCaja
from apps.caja.servicios import mover_caja
from apps.catalogo.models import PrecioProducto
from apps.clientes.models import CONSUMIDOR_FINAL_ID
from apps.inventario.models import MovimientoInventario
from apps.inventario.servicios import a_bandejas, mover_stock
from config.comunes import MedioPago

from .models import (
    CuentaCorriente,
    DetalleVenta,
    DetalleVentaMovimiento,
    PagoVenta,
    PagoVentaMovCaja,
    Venta,
)


def precio_vigente(producto, presentacion):
    precio = PrecioProducto.objects.filter(
        producto=producto, presentacion=presentacion, fecha_hasta__isnull=True
    ).first()
    if precio is None:
        raise ValidationError({"non_field_errors": (
            f"{producto} en {presentacion} no tiene precio de venta: confirmalo en Catálogo › Precios."
        )})
    return precio.precio


def registrar_venta(datos, usuario):
    """Se llama dentro de una transacción: si algo falla, no queda nada a medias."""
    venta = Venta.objects.create(
        cliente_id=datos["cliente"].pk if datos.get("cliente") else CONSUMIDOR_FINAL_ID,
        modalidad=datos["modalidad"], total=Decimal("0"), usuario=usuario,
    )
    for linea in datos["detalles"]:
        producto, presentacion, cantidad = linea["producto"], linea["presentacion"], linea["cantidad"]
        precio = precio_vigente(producto, presentacion)
        detalle = DetalleVenta.objects.create(
            venta=venta, producto=producto, presentacion=presentacion, cantidad=cantidad,
            precio_unitario_aplicado=precio, subtotal=(cantidad * precio).quantize(Decimal("0.01")),
        )
        movimiento = mover_stock(
            producto, a_bandejas(cantidad, presentacion),
            MovimientoInventario.Tipo.EGRESO_VENTA, usuario,
        )
        DetalleVentaMovimiento.objects.create(detalle_venta=detalle, movimiento_inventario=movimiento)
        venta.total += detalle.subtotal
    venta.save(update_fields=["total"])

    if venta.modalidad == Venta.Modalidad.CONTADO:
        cobrar_contado(venta, datos["medio_pago"], datos.get("referencia_transferencia"), usuario)
    else:
        # Fiado (HU-05-F): la deuda queda en la cuenta corriente del cliente.
        CuentaCorriente.objects.create(
            venta=venta, importe_original=venta.total, saldo_pendiente=venta.total
        )
    return venta


def cobrar_contado(venta, medio_pago, referencia, usuario):
    pago = PagoVenta.objects.create(
        venta=venta, medio_pago=medio_pago, importe=venta.total,
        referencia_transferencia=referencia or None,
    )
    if medio_pago == MedioPago.EFECTIVO:
        movimiento = mover_caja(MovimientoCaja.Tipo.VENTA_EFECTIVO, venta.total, usuario)
        PagoVentaMovCaja.objects.create(pago_venta=pago, movimiento_caja=movimiento)
    return pago
