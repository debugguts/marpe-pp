"""Reglas del stock (HU-06), en un solo lugar.

Toda entrada o salida de huevos pasa por mover_stock(): compras, ventas, mermas y ajustes.
Así el stock siempre coincide con la suma de sus movimientos.
"""

from decimal import Decimal

from rest_framework.exceptions import ValidationError

from config.formato import bandejas as texto_bandejas

from .models import MovimientoInventario, Stock

Tipo = MovimientoInventario.Tipo
SUMAN = [Tipo.INGRESO_COMPRA, Tipo.AJUSTE_POSITIVO]  # el resto resta


def a_bandejas(cantidad, presentacion):
    """2 cajas × 6 bandejas = 12 bandejas. El stock siempre se guarda en bandejas."""
    return (cantidad * presentacion.cantidad_bandejas_equivalentes).quantize(Decimal("0.000001"))


def mover_stock(producto, bandejas, tipo, usuario, motivo=None):
    """Suma o resta bandejas y deja el movimiento registrado.

    Si es una salida y no alcanza el stock, corta con un mensaje que dice cuánto hay.
    """
    stock, _ = Stock.objects.select_for_update().get_or_create(
        producto=producto,
        defaults={"cantidad_bandejas": Decimal("0"), "stock_minimo_bandejas": Decimal("0")},
    )
    if tipo in SUMAN:
        stock.cantidad_bandejas += bandejas
    else:
        if bandejas > stock.cantidad_bandejas:
            raise ValidationError({"non_field_errors": (
                f"Stock insuficiente de {producto}: hay {texto_bandejas(stock.cantidad_bandejas)} "
                f"bandejas y se necesitan {texto_bandejas(bandejas)}."
            )})
        stock.cantidad_bandejas -= bandejas
    stock.save()
    return MovimientoInventario.objects.create(
        producto=producto, usuario=usuario, tipo_movimiento=tipo,
        cantidad_bandejas=bandejas, motivo=motivo,
    )
