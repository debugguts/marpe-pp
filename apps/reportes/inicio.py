"""Pantalla de Inicio: el resumen del día en una sola consulta (cualquier usuario con sesión).

GET /api/inicio/
  ventas de hoy (total, cantidad, por medio) y de ayer (para comparar), ventas de los últimos 7 días
  y de los últimos 6 meses, la caja abierta, el stock de cada huevo, lo que deben los clientes
  (con lo fiado en los últimos 14 días) y los movimientos de hoy.
  Las compras y los gastos del día solo los ve el administrador (como en el resto del sistema).
"""

from datetime import date, timedelta

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.caja.models import Caja
from apps.caja.serializers import CajaSerializer
from apps.compras.models import Compra
from apps.gastos.models import Gasto
from apps.inventario.models import MovimientoInventario, Stock
from apps.inventario.serializers import StockSerializer
from apps.ventas.models import CuentaCorriente, PagoCuenta, Venta
from config.formato import bandejas as texto_bandejas
from config.permisos import es_administrador

from .calculos import cobros, redondear, suma

# Los ajustes que hacen solas las modificaciones y anulaciones de ventas no son movimientos "a mano".
AUTOMATICOS = ("Modificación de la venta", "Anulación de la venta",
               "Modificación de la compra", "Anulación de la compra", "Anulación del gasto")


def detalle_venta(venta):
    lineas = ", ".join(
        f"{texto_bandejas(d.cantidad)} {d.presentacion.nombre} {d.producto}" for d in venta.detalles.all()
    )
    return f"{venta.cliente.nombre} · {lineas}"


def movimientos_de_hoy(hoy, administrador):
    """Lista mezclada de lo que pasó hoy, lo último primero. Compras y gastos no tienen hora: van al final."""
    filas = []
    ventas = (Venta.objects.filter(fecha__date=hoy).select_related("cliente")
              .prefetch_related("detalles__producto", "detalles__presentacion", "pagos"))
    for v in ventas:
        anulada = v.estado == Venta.Estado.ANULADA
        pago = "Fiado" if v.modalidad == Venta.Modalidad.FIADO else ", ".join(p.get_medio_pago_display() for p in v.pagos.all())
        filas.append({"hora": v.fecha, "tipo": "Venta anulada" if anulada else "Venta", "detalle": f"Nº {v.pk} · {detalle_venta(v)}",
                      "quien": v.cliente.nombre, "que": detalle_venta(v).split(" · ", 1)[1],
                      "pago": pago, "importe": v.total, "sentido": "neutro" if anulada else "entra"})

    for c in PagoCuenta.objects.filter(fecha_hora__date=hoy).select_related("cuenta__venta__cliente"):
        filas.append({"hora": c.fecha_hora, "tipo": "Cobro de deuda",
                      "detalle": f"{c.cuenta.venta.cliente.nombre} · venta Nº {c.cuenta.venta_id}",
                      "quien": c.cuenta.venta.cliente.nombre, "que": "Cobro de deuda",
                      "pago": c.get_medio_pago_display(), "importe": c.importe, "sentido": "entra"})

    manuales = (MovimientoInventario.objects.filter(fecha_hora__date=hoy, tipo_movimiento__in=[
        MovimientoInventario.Tipo.MERMA, MovimientoInventario.Tipo.AJUSTE_POSITIVO, MovimientoInventario.Tipo.AJUSTE_NEGATIVO])
        .select_related("producto"))
    for m in manuales:
        if (m.motivo or "").startswith(AUTOMATICOS):
            continue
        filas.append({"hora": m.fecha_hora, "tipo": m.get_tipo_movimiento_display(),
                      "detalle": f"{texto_bandejas(m.cantidad_bandejas)} bandejas de {m.producto} · {m.motivo or 'sin motivo'}",
                      "quien": str(m.producto), "que": f"{texto_bandejas(m.cantidad_bandejas)} bandejas · {m.motivo or 'sin motivo'}",
                      "pago": None, "importe": None, "sentido": "neutro"})

    if administrador:
        for c in Compra.objects.filter(fecha=hoy).exclude(estado=Compra.Estado.ANULADA).select_related("proveedor"):
            filas.append({"hora": None, "tipo": "Compra", "detalle": f"Nº {c.pk} · {c.proveedor.nombre}",
                          "quien": c.proveedor.nombre, "que": f"Compra Nº {c.pk}",
                          "pago": None, "importe": c.total, "sentido": "sale"})
        for g in Gasto.objects.filter(fecha=hoy).exclude(estado=Gasto.Estado.ANULADO):
            filas.append({"hora": None, "tipo": "Gasto", "detalle": f"{g.concepto} ({g.categoria})",
                          "quien": g.concepto, "que": f"Gasto · {g.categoria}",
                          "pago": g.get_medio_pago_display(), "importe": g.importe, "sentido": "sale"})

    con_hora = sorted((f for f in filas if f["hora"]), key=lambda f: f["hora"], reverse=True)
    return con_hora + [f for f in filas if not f["hora"]]


def inicio_de_mes(dia, atras):
    """Primer día del mes que está «atras» meses antes del de «dia»."""
    total = dia.year * 12 + dia.month - 1 - atras
    return date(total // 12, total % 12 + 1, 1)


def ventas_por_mes(hoy, meses=6):
    """Lo vendido (ventas confirmadas) en cada uno de los últimos meses, el actual incluido."""
    resultado = []
    for atras in range(meses - 1, -1, -1):
        desde = inicio_de_mes(hoy, atras)
        hasta = inicio_de_mes(hoy, atras - 1)
        vendidas = Venta.objects.filter(fecha__date__gte=desde, fecha__date__lt=hasta, estado=Venta.Estado.CONFIRMADA)
        resultado.append({"mes": desde.strftime("%Y-%m"), "total": redondear(suma(vendidas, "total"))})
    return resultado


def fiado_por_dia(hoy, dias=14):
    """Lo que se vendió fiado cada día de las últimas semanas (para ver si la deuda crece)."""
    resultado = []
    for atras in range(dias - 1, -1, -1):
        dia = hoy - timedelta(days=atras)
        fiadas = Venta.objects.filter(fecha__date=dia, estado=Venta.Estado.CONFIRMADA, modalidad=Venta.Modalidad.FIADO)
        resultado.append({"fecha": dia.isoformat(), "total": redondear(suma(fiadas, "total"))})
    return resultado


class InicioView(APIView):
    def get(self, request):
        hoy = timezone.localdate()
        ventas_hoy = Venta.objects.filter(fecha__date=hoy, estado=Venta.Estado.CONFIRMADA)
        ventas_ayer = Venta.objects.filter(fecha__date=hoy - timedelta(days=1), estado=Venta.Estado.CONFIRMADA)
        caja = Caja.objects.select_related("usuario_apertura").filter(estado=Caja.Estado.ABIERTA).first()
        pendientes = CuentaCorriente.objects.filter(estado=CuentaCorriente.Estado.PENDIENTE)
        stock = Stock.objects.select_related("producto").order_by("producto__tipo_huevo", "producto__tamano")

        semana = []
        for atras in range(6, -1, -1):
            dia = hoy - timedelta(days=atras)
            vendidas = Venta.objects.filter(fecha__date=dia, estado=Venta.Estado.CONFIRMADA)
            semana.append({"fecha": dia.isoformat(), "total": redondear(suma(vendidas, "total"))})

        ventas = {"total": redondear(suma(ventas_hoy, "total")), "cantidad": ventas_hoy.count()}
        if es_administrador(request.user):  # arqueo ciego: el efectivo del día lo ve el administrador
            ventas["por_medio"] = cobros(ventas_hoy)
        return Response({
            "hoy": hoy.isoformat(),
            "ventas": ventas,
            "ayer": {"total": redondear(suma(ventas_ayer, "total")), "cantidad": ventas_ayer.count()},
            "semana": semana,
            "meses": ventas_por_mes(hoy),
            "caja": CajaSerializer(caja, context={"request": request}).data if caja else None,
            "stock": StockSerializer(stock, many=True).data,
            "deudas": {"total": redondear(suma(pendientes, "saldo_pendiente")), "cantidad": pendientes.count(),
                       "fiado_por_dia": fiado_por_dia(hoy)},
            "movimientos": movimientos_de_hoy(hoy, es_administrador(request.user))[:12],
        })
