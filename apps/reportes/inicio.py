"""Pantalla de Inicio: el resumen del día en una sola consulta (cualquier usuario con sesión).

GET /api/inicio/
  ventas de hoy (total, cantidad, por medio), ventas de los últimos 7 días, la caja abierta,
  el stock de cada huevo, lo que deben los clientes y los movimientos de hoy.
  Las compras y los gastos del día solo los ve el administrador (como en el resto del sistema).
"""

from datetime import timedelta

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
AUTOMATICOS = ("Modificación de la venta", "Anulación de la venta")


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
                      "pago": pago, "importe": v.total, "sentido": "neutro" if anulada else "entra"})

    for c in PagoCuenta.objects.filter(fecha_hora__date=hoy).select_related("cuenta__venta__cliente"):
        filas.append({"hora": c.fecha_hora, "tipo": "Cobro de deuda",
                      "detalle": f"{c.cuenta.venta.cliente.nombre} · venta Nº {c.cuenta.venta_id}",
                      "pago": c.get_medio_pago_display(), "importe": c.importe, "sentido": "entra"})

    manuales = (MovimientoInventario.objects.filter(fecha_hora__date=hoy, tipo_movimiento__in=[
        MovimientoInventario.Tipo.MERMA, MovimientoInventario.Tipo.AJUSTE_POSITIVO, MovimientoInventario.Tipo.AJUSTE_NEGATIVO])
        .select_related("producto"))
    for m in manuales:
        if (m.motivo or "").startswith(AUTOMATICOS):
            continue
        filas.append({"hora": m.fecha_hora, "tipo": m.get_tipo_movimiento_display(),
                      "detalle": f"{texto_bandejas(m.cantidad_bandejas)} bandejas de {m.producto} · {m.motivo or 'sin motivo'}",
                      "pago": None, "importe": None, "sentido": "neutro"})

    if administrador:
        for c in Compra.objects.filter(fecha=hoy).select_related("proveedor"):
            filas.append({"hora": None, "tipo": "Compra", "detalle": f"Nº {c.pk} · {c.proveedor.nombre}",
                          "pago": None, "importe": c.total, "sentido": "sale"})
        for g in Gasto.objects.filter(fecha=hoy):
            filas.append({"hora": None, "tipo": "Gasto", "detalle": f"{g.concepto} ({g.categoria})",
                          "pago": g.get_medio_pago_display(), "importe": g.importe, "sentido": "sale"})

    con_hora = sorted((f for f in filas if f["hora"]), key=lambda f: f["hora"], reverse=True)
    return con_hora + [f for f in filas if not f["hora"]]


class InicioView(APIView):
    def get(self, request):
        hoy = timezone.localdate()
        ventas_hoy = Venta.objects.filter(fecha__date=hoy, estado=Venta.Estado.CONFIRMADA)
        caja = Caja.objects.select_related("usuario_apertura").filter(estado=Caja.Estado.ABIERTA).first()
        pendientes = CuentaCorriente.objects.filter(estado=CuentaCorriente.Estado.PENDIENTE)
        stock = Stock.objects.select_related("producto").order_by("producto__tipo_huevo", "producto__tamano")

        semana = []
        for atras in range(6, -1, -1):
            dia = hoy - timedelta(days=atras)
            vendidas = Venta.objects.filter(fecha__date=dia, estado=Venta.Estado.CONFIRMADA)
            semana.append({"fecha": dia.isoformat(), "total": redondear(suma(vendidas, "total"))})

        return Response({
            "hoy": hoy.isoformat(),
            "ventas": {"total": redondear(suma(ventas_hoy, "total")), "cantidad": ventas_hoy.count(),
                       "por_medio": cobros(ventas_hoy)},
            "semana": semana,
            "caja": CajaSerializer(caja).data if caja else None,
            "stock": StockSerializer(stock, many=True).data,
            "deudas": {"total": redondear(suma(pendientes, "saldo_pendiente")), "cantidad": pendientes.count()},
            "movimientos": movimientos_de_hoy(hoy, es_administrador(request.user))[:12],
        })
