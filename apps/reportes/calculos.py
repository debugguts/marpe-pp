"""Reportes para el dueño (Sprint 6): ventas, compras, comparación y ganancia de un período.

Cuentas (las mismas que usa el precio sugerido, así todo el sistema habla igual):
- Ventas: ventas CONFIRMADAS del período (las anuladas se informan aparte, no suman).
- Costo de lo vendido: bandejas vendidas × costo promedio por bandeja de ese huevo
  (lo pagado en las compras del período ÷ bandejas compradas; si no hubo compras, el costo vigente del proveedor).
- Ganancia bruta = ventas − costo de lo vendido.
- Ganancia neta  = ganancia bruta − gastos del período (fijos y variables).
- Balance (plata que entró menos plata que salió) = ventas − compras − gastos.
"""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.catalogo.models import Producto
from apps.catalogo.precios import costo_por_bandeja
from apps.compras.models import Compra
from apps.gastos.models import Gasto
from apps.ventas.models import DetalleVenta, PagoVenta, Venta
from config.comunes import MedioPago

CERO = Decimal("0")
CENTAVO = Decimal("0.01")
DIAS_POR_DIA = 62  # hasta 2 meses se grafica día por día; más largo, por mes


def redondear(valor):
    return (valor or CERO).quantize(CENTAVO)


def ventas_del_periodo(desde, hasta):
    return Venta.objects.filter(fecha__date__range=(desde, hasta))


def compras_del_periodo(desde, hasta):
    return Compra.objects.filter(fecha__range=(desde, hasta))


def gastos_del_periodo(desde, hasta):
    return Gasto.objects.filter(fecha__range=(desde, hasta))


def suma(consulta, campo):
    return consulta.aggregate(t=Sum(campo))["t"] or CERO


def por_producto(confirmadas, desde, hasta):
    """Lo vendido de cada huevo, con su costo y su ganancia bruta."""
    lineas = DetalleVenta.objects.filter(venta__in=confirmadas).select_related("producto", "presentacion")
    huevos = {}
    for d in lineas:
        fila = huevos.setdefault(d.producto_id, {
            "producto": d.producto_id, "nombre": str(d.producto),
            "bandejas": CERO, "vendido": CERO, "por_presentacion": defaultdict(lambda: CERO),
        })
        fila["bandejas"] += d.cantidad * d.presentacion.cantidad_bandejas_equivalentes
        fila["vendido"] += d.subtotal
        fila["por_presentacion"][d.presentacion.nombre] += d.cantidad

    filas, sin_costo = [], []
    for fila in huevos.values():
        costo_bandeja, _ = costo_por_bandeja(Producto(pk=fila["producto"]), desde, hasta)
        if costo_bandeja is None:
            sin_costo.append(fila["nombre"])
            costo = None
        else:
            costo = fila["bandejas"] * costo_bandeja
        filas.append({
            "producto": fila["producto"],
            "nombre": fila["nombre"],
            "bandejas": fila["bandejas"].quantize(CENTAVO),
            "vendido": redondear(fila["vendido"]),
            "costo": redondear(costo) if costo is not None else None,
            "ganancia": redondear(fila["vendido"] - costo) if costo is not None else None,
            "por_presentacion": {k: v.normalize() for k, v in fila["por_presentacion"].items()},
        })
    filas.sort(key=lambda f: f["vendido"], reverse=True)
    return filas, sin_costo


def evolucion(desde, hasta, confirmadas, compras, gastos):
    """Ventas, compras y gastos por día (o por mes si el período es largo), para el gráfico."""
    por_mes = (hasta - desde).days + 1 > DIAS_POR_DIA
    clave = (lambda d: d.replace(day=1)) if por_mes else (lambda d: d)

    puntos = {}
    dia = desde
    while dia <= hasta:
        puntos.setdefault(clave(dia), {"ventas": CERO, "compras": CERO, "gastos": CERO})
        dia += timedelta(days=1)

    for v in confirmadas.only("fecha", "total"):
        puntos[clave(timezone.localdate(v.fecha))]["ventas"] += v.total
    for c in compras.only("fecha", "total"):
        puntos[clave(c.fecha)]["compras"] += c.total
    for g in gastos.only("fecha", "importe"):
        puntos[clave(g.fecha)]["gastos"] += g.importe

    return {
        "agrupado": "mes" if por_mes else "dia",
        "puntos": [{"fecha": f.isoformat(), **{k: redondear(v) for k, v in p.items()}} for f, p in sorted(puntos.items())],
    }


def resumen(desde, hasta):
    todas = ventas_del_periodo(desde, hasta)
    confirmadas = todas.filter(estado=Venta.Estado.CONFIRMADA)
    anuladas = todas.filter(estado=Venta.Estado.ANULADA)
    compras = compras_del_periodo(desde, hasta)
    gastos = gastos_del_periodo(desde, hasta)

    total_ventas = suma(confirmadas, "total")
    total_compras = suma(compras, "total")
    total_gastos = suma(gastos, "importe")
    cantidad_ventas = confirmadas.count()

    pagos = PagoVenta.objects.filter(venta__in=confirmadas)
    por_medio = {
        "efectivo": redondear(suma(pagos.filter(medio_pago=MedioPago.EFECTIVO), "importe")),
        "transferencia": redondear(suma(pagos.filter(medio_pago=MedioPago.TRANSFERENCIA), "importe")),
        "fiado": redondear(suma(confirmadas.filter(modalidad=Venta.Modalidad.FIADO), "total")),
    }

    productos, sin_costo = por_producto(confirmadas, desde, hasta)
    costo_vendido = sum((p["costo"] for p in productos if p["costo"] is not None), CERO)
    ganancia_bruta = total_ventas - costo_vendido

    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "ventas": {
            "total": redondear(total_ventas),
            "cantidad": cantidad_ventas,
            "ticket_promedio": redondear(total_ventas / cantidad_ventas) if cantidad_ventas else redondear(CERO),
            "por_medio": por_medio,
            "anuladas": {"cantidad": anuladas.count(), "total": redondear(suma(anuladas, "total"))},
        },
        "compras": {"total": redondear(total_compras), "cantidad": compras.count()},
        "gastos": {
            "total": redondear(total_gastos),
            "fijos": redondear(suma(gastos.filter(tipo=Gasto.Tipo.FIJO), "importe")),
            "variables": redondear(suma(gastos.exclude(tipo=Gasto.Tipo.FIJO), "importe")),
        },
        "ganancia": {
            "costo_vendido": redondear(costo_vendido),
            "bruta": redondear(ganancia_bruta),
            "neta": redondear(ganancia_bruta - total_gastos),
            "sin_costo": sin_costo,
        },
        "balance": redondear(total_ventas - total_compras - total_gastos),
        "productos": productos,
        "evolucion": evolucion(desde, hasta, confirmadas, compras, gastos),
    }


def leer_periodo(parametros, hoy=None):
    """?desde=2026-11-01&hasta=2026-11-30. Sin fechas: el mes en curso hasta hoy."""
    hoy = hoy or date.today()
    errores = {}
    try:
        desde = date.fromisoformat(parametros.get("desde")) if parametros.get("desde") else hoy.replace(day=1)
    except ValueError:
        errores["desde"] = "Fecha inválida: usá el formato AAAA-MM-DD."
    try:
        hasta = date.fromisoformat(parametros.get("hasta")) if parametros.get("hasta") else hoy
    except ValueError:
        errores["hasta"] = "Fecha inválida: usá el formato AAAA-MM-DD."
    if not errores:
        if desde > hasta:
            errores["hasta"] = "La fecha final no puede ser anterior a la inicial."
        elif (hasta - desde).days > 366:
            errores["hasta"] = "El período puede ser de hasta un año."
    return (None, None, errores) if errores else (desde, hasta, None)
