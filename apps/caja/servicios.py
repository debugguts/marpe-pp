"""Reglas de la caja (HU-10), en un solo lugar.

Las usan la pantalla de Caja y también las ventas, cobros y gastos en efectivo:
todo peso que entra o sale en efectivo pasa por mover_caja().
"""

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from config.formato import pesos

from .models import Caja, MovimientoCaja

Tipo = MovimientoCaja.Tipo
INGRESOS = [Tipo.VENTA_EFECTIVO, Tipo.COBRO_DEUDA_EFECTIVO, Tipo.INGRESO_MANUAL]
EGRESOS = [Tipo.GASTO_EFECTIVO, Tipo.RETIRO]


def caja_abierta():
    """Devuelve la caja abierta. Si no hay, corta con un mensaje claro."""
    caja = Caja.objects.select_for_update().filter(estado=Caja.Estado.ABIERTA).first()
    if caja is None:
        raise ValidationError({"non_field_errors": "No hay una caja abierta. Abrila antes de cobrar o pagar en efectivo."})
    return caja


def saldo_actual(caja):
    """Saldo esperado = saldo inicial + ingresos en efectivo − egresos en efectivo."""

    def total(tipos):
        suma = caja.movimientos.filter(tipo_movimiento__in=tipos).aggregate(t=Sum("importe"))["t"]
        return suma or Decimal("0")

    return caja.saldo_inicial + total(INGRESOS) - total(EGRESOS)


def abrir_caja(saldo_inicial, usuario):
    if Caja.objects.filter(estado=Caja.Estado.ABIERTA).exists():
        raise ValidationError({"non_field_errors": "Ya hay una caja abierta: cerrala antes de abrir otra."})
    return Caja.objects.create(saldo_inicial=saldo_inicial, usuario_apertura=usuario)


def mover_caja(tipo, importe, usuario, motivo=None):
    """Registra un movimiento de efectivo en la caja abierta.

    Si es una salida (gasto o retiro) controla que alcance el efectivo.
    """
    caja = caja_abierta()
    if tipo in EGRESOS:
        disponible = saldo_actual(caja)
        if importe > disponible:
            raise ValidationError({"importe": f"No alcanza el efectivo de la caja: hay {pesos(disponible)}."})
    return MovimientoCaja.objects.create(
        caja=caja, usuario=usuario, tipo_movimiento=tipo, importe=importe, motivo=motivo
    )


def cerrar_caja(caja, efectivo_contado, usuario):
    """Arqueo: compara lo contado con lo que debería haber y guarda la diferencia."""
    if caja.estado == Caja.Estado.CERRADA:
        raise ValidationError({"non_field_errors": "Esa caja ya está cerrada."})
    caja.saldo_esperado = saldo_actual(caja)
    caja.efectivo_contado = efectivo_contado
    caja.diferencia = efectivo_contado - caja.saldo_esperado  # negativa = falta plata
    caja.fecha_hora_cierre = timezone.now()
    caja.usuario_cierre = usuario
    caja.estado = Caja.Estado.CERRADA
    caja.save()
    return caja
