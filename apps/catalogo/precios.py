"""Precio sugerido de venta (HU-02-C), pedido del cliente.

Precio de equilibrio por bandeja = costo promedio por bandeja + gasto fijo por bandeja.
  - Costo promedio: lo que se pagó en las compras del mes ÷ bandejas compradas
    (promedio ponderado: pesa más el proveedor al que más se le compró).
    Si ese producto no tuvo compras en el mes, se usa el promedio de los costos vigentes de los proveedores.
  - Gasto fijo por bandeja: gastos fijos del mes (puesto de feria, sueldos...) ÷ bandejas compradas en el mes.
    Respaldo: si el mes recién empieza y todavía no se cargó ningún fijo, se usan los fijos (y las compras)
    del mes anterior, para que el precio sugerido no caiga a "sin gastos fijos" el día 1.
Precio sugerido de una presentación = equilibrio por bandeja × bandejas que tiene esa presentación.
Cualquier precio por encima del equilibrio es ganancia neta estimada.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_UP, Decimal

from django.db.models import Sum

from apps.compras.models import DetalleCompra
from apps.gastos.models import Gasto
from apps.proveedores.models import CostoProveedor

CENTAVO = Decimal("0.01")


def mes_actual(hoy=None):
    """Primer y último día del mes de hoy: (1/11, 30/11)."""
    hoy = hoy or date.today()
    ultimo_dia = monthrange(hoy.year, hoy.month)[1]
    return hoy.replace(day=1), hoy.replace(day=ultimo_dia)


def bandejas_de(detalles):
    return sum((d.cantidad * d.presentacion.cantidad_bandejas_equivalentes for d in detalles), Decimal("0"))


def compras_del_mes(desde, hasta, producto=None):
    detalles = (DetalleCompra.objects.filter(compra__fecha__range=(desde, hasta))
                .exclude(compra__estado="ANULADA").select_related("presentacion"))
    return detalles.filter(producto=producto) if producto else detalles


def costo_por_bandeja(producto, desde, hasta):
    """Devuelve (costo, de dónde salió) o (None, None) si no hay ningún dato."""
    detalles = list(compras_del_mes(desde, hasta, producto))
    bandejas = bandejas_de(detalles)
    if bandejas:
        pagado = sum((d.subtotal for d in detalles), Decimal("0"))
        return pagado / bandejas, "compras del mes"

    costos = CostoProveedor.objects.filter(producto=producto, fecha_hasta__isnull=True).select_related("presentacion")
    por_bandeja = [c.precio_costo / c.presentacion.cantidad_bandejas_equivalentes for c in costos]
    if por_bandeja:
        return sum(por_bandeja) / len(por_bandeja), "costos vigentes de los proveedores"
    return None, None


def fijos_entre(desde, hasta):
    fijos = (Gasto.objects.filter(tipo=Gasto.Tipo.FIJO, fecha__range=(desde, hasta))
             .exclude(estado=Gasto.Estado.ANULADO).aggregate(t=Sum("importe"))["t"])
    return fijos or Decimal("0")


def mes_de_los_fijos(desde, hasta):
    """Mes cuyos fijos toma el precio: el actual o, si todavía no tiene ninguno, el anterior.

    Devuelve (desde, hasta, es_respaldo).
    """
    if fijos_entre(desde, hasta):
        return desde, hasta, False
    anterior_hasta = desde - timedelta(days=1)
    anterior_desde = anterior_hasta.replace(day=1)
    if fijos_entre(anterior_desde, anterior_hasta):
        return anterior_desde, anterior_hasta, True
    return desde, hasta, False


def gasto_fijo_por_bandeja(desde, hasta):
    """Devuelve (gasto fijo por bandeja, total de gastos fijos, bandejas compradas en el mes, es_respaldo)."""
    desde, hasta, respaldo = mes_de_los_fijos(desde, hasta)
    fijos = fijos_entre(desde, hasta)
    bandejas = bandejas_de(compras_del_mes(desde, hasta))
    return (fijos / bandejas if bandejas else Decimal("0")), fijos, bandejas, respaldo


def calcular(producto, presentaciones, hoy=None):
    """Cálculo completo de un producto, con el detalle para mostrar "cómo lo calculó"."""
    desde, hasta = mes_actual(hoy)
    costo, origen = costo_por_bandeja(producto, desde, hasta)
    if costo is None:
        return {"error": f"Faltan costos: cargá el costo de {producto} en al menos un proveedor."}

    fijo, total_fijos, bandejas_mes, respaldo = gasto_fijo_por_bandeja(desde, hasta)
    equilibrio = costo + fijo
    return {
        "costo_bandeja": costo.quantize(CENTAVO),
        "origen_costo": origen,
        "gasto_fijo_bandeja": fijo.quantize(CENTAVO),
        "gastos_fijos_mes": total_fijos,
        "fijos_del_mes_anterior": respaldo,
        "bandejas_compradas_mes": bandejas_mes.quantize(CENTAVO),
        "equilibrio_bandeja": equilibrio.quantize(CENTAVO),
        "sugeridos": {
            # Se redondea para arriba: nunca sugerir por debajo del equilibrio.
            p.pk: (equilibrio * p.cantidad_bandejas_equivalentes).quantize(CENTAVO, rounding=ROUND_UP)
            for p in presentaciones
        },
    }
