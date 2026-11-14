"""Reglas de las ventas (HU-05): alta, modificación y anulación.

Alta:
1) Toma el precio vigente de cada producto y lo guarda en la venta (no cambia aunque después suba).
2) Descuenta los huevos del stock (si no alcanza, no se vende nada).
3) Contado: registra el pago; si es en efectivo, entra a la caja.
   Fiado: abre la deuda en la cuenta corriente del cliente.

Modificación: devuelve lo que había movido la venta (stock y efectivo) y la vuelve a cargar con los datos
nuevos. La venta conserva su número y su fecha; la versión anterior queda escrita en REGISTRO_ACTIVIDAD.

Anulación: en vez de borrar, la venta pasa a ANULADA con su motivo; se devuelve el stock y el efectivo.

Nada se borra de STOCK ni de CAJA: cada devolución es un movimiento nuevo con motivo, así los saldos
siempre coinciden con la suma de sus movimientos.
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.caja.models import MovimientoCaja
from apps.caja.servicios import mover_caja
from apps.catalogo.models import PrecioProducto
from apps.clientes.models import CONSUMIDOR_FINAL_ID
from apps.inventario.models import MovimientoInventario
from apps.inventario.servicios import a_bandejas, mover_stock
from config.comunes import MedioPago
from config.formato import bandejas as texto_bandejas
from config.formato import pesos

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


# ---------- Alta ----------

def registrar_venta(datos, usuario):
    """Se llama dentro de una transacción: si algo falla, no queda nada a medias."""
    venta = Venta(usuario=usuario)
    cargar_venta(venta, datos, usuario)
    return venta


def cargar_venta(venta, datos, usuario, precios_anteriores=None):
    """Llena la venta con sus líneas, descuenta el stock y cobra o fía.

    precios_anteriores: en una modificación, las líneas que ya estaban conservan el precio
    con el que se vendieron (HU-05-D). Las líneas nuevas toman el precio vigente.
    """
    precios_anteriores = precios_anteriores or {}
    venta.cliente_id = datos["cliente"].pk if datos.get("cliente") else CONSUMIDOR_FINAL_ID
    venta.modalidad = datos["modalidad"]
    venta.total = Decimal("0")
    venta.save()

    for linea in datos["detalles"]:
        producto, presentacion, cantidad = linea["producto"], linea["presentacion"], linea["cantidad"]
        precio = precios_anteriores.get((producto.pk, presentacion.pk)) or precio_vigente(producto, presentacion)
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


# ---------- Modificación y anulación ----------

def controlar_que_se_pueda_cambiar(venta):
    """Una venta anulada no se toca, y una venta fiada cuya deuda ya se cobró tampoco."""
    if venta.estado == Venta.Estado.ANULADA:
        raise ValidationError({"non_field_errors": "Esta venta está anulada: no se puede modificar ni volver a anular."})
    cuenta = CuentaCorriente.objects.filter(venta=venta).first()
    if cuenta and cuenta.pagos.exists():
        raise ValidationError({"non_field_errors": (
            "La deuda de esta venta ya se cobró: no se puede modificar ni anular."
        )})


def devolver_stock(venta, usuario, motivo):
    """Vuelve al stock exactamente las bandejas que había descontado la venta."""
    for detalle in venta.detalles.select_related("producto"):
        enlace = DetalleVentaMovimiento.objects.select_related("movimiento_inventario").get(detalle_venta=detalle)
        mover_stock(detalle.producto, enlace.movimiento_inventario.cantidad_bandejas,
                    MovimientoInventario.Tipo.AJUSTE_POSITIVO, usuario, motivo)


def efectivo_cobrado(venta):
    return sum((p.importe for p in venta.pagos.all() if p.medio_pago == MedioPago.EFECTIVO), Decimal("0"))


def devolver_efectivo(importe, usuario, motivo):
    """Saca de la caja abierta el efectivo que había entrado por la venta."""
    if importe > 0:
        mover_caja(MovimientoCaja.Tipo.RETIRO, importe, usuario, motivo)


def resumen(venta):
    """Texto con lo esencial de la venta, para dejar constancia en el registro de actividad."""
    lineas = "; ".join(
        f"{texto_bandejas(d.cantidad)} {d.presentacion.nombre} {d.producto} a {pesos(d.precio_unitario_aplicado)}"
        for d in venta.detalles.select_related("producto", "presentacion")
    )
    pago = ", ".join(p.get_medio_pago_display() for p in venta.pagos.all()) or "fiado"
    return f"{venta.get_modalidad_display()} ({pago}) · cliente {venta.cliente.nombre} · {lineas} · total {pesos(venta.total)}"


def modificar_venta(venta, datos, usuario):
    """Reemplaza el contenido de la venta. Se llama dentro de una transacción.

    Devuelve (venta, como_estaba) para registrar en la actividad la versión anterior.
    """
    controlar_que_se_pueda_cambiar(venta)
    como_estaba = resumen(venta)
    motivo = f"Modificación de la venta {venta.pk}"
    precios_anteriores = {(d.producto_id, d.presentacion_id): d.precio_unitario_aplicado
                          for d in venta.detalles.all()}
    efectivo_anterior = efectivo_cobrado(venta)

    # 1) Devolver lo que había descontado del stock (antes de cargar, así esas bandejas se pueden volver a usar).
    devolver_stock(venta, usuario, motivo)

    # 2) Sacar el contenido anterior. Los movimientos de stock y caja NO se borran: quedan con su contrapartida.
    DetalleVentaMovimiento.objects.filter(detalle_venta__venta=venta).delete()
    venta.detalles.all().delete()
    PagoVentaMovCaja.objects.filter(pago_venta__venta=venta).delete()
    venta.pagos.all().delete()
    CuentaCorriente.objects.filter(venta=venta).delete()

    # 3) Cargar la versión nueva (stock, cobro o deuda) y, al final, devolver el efectivo anterior.
    #    Primero entra el cobro nuevo y después sale el viejo: así el control de efectivo ve el saldo real.
    venta.fecha_modificacion = timezone.now()
    cargar_venta(venta, datos, usuario, precios_anteriores)
    venta.save(update_fields=["fecha_modificacion"])
    devolver_efectivo(efectivo_anterior, usuario, motivo)
    return venta, como_estaba


def anular_venta(venta, motivo, usuario):
    """La venta no se borra: queda ANULADA con su motivo y se devuelve el stock y el efectivo."""
    controlar_que_se_pueda_cambiar(venta)
    texto = f"Anulación de la venta {venta.pk}: {motivo}"
    devolver_stock(venta, usuario, texto)
    devolver_efectivo(efectivo_cobrado(venta), usuario, texto)

    cuenta = CuentaCorriente.objects.filter(venta=venta).first()
    if cuenta:  # la deuda de una venta anulada ya no se cobra
        cuenta.saldo_pendiente = Decimal("0")
        cuenta.estado = CuentaCorriente.Estado.CANCELADA
        cuenta.save(update_fields=["saldo_pendiente", "estado"])

    venta.estado = Venta.Estado.ANULADA
    venta.motivo_anulacion = motivo
    venta.fecha_anulacion = timezone.now()
    venta.save(update_fields=["estado", "motivo_anulacion", "fecha_anulacion"])
    return venta
