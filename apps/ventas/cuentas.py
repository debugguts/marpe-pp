"""Cuenta corriente de los clientes: deudas de ventas fiadas y su cobro (HU-05-G, HU-07-C/D/E).

La deuda se crea sola al registrar una venta fiada (ver servicios.py).
Acá se consulta y se cobra. En esta versión la deuda se cancela en un solo pago, por el total.
"""

from django.db import transaction
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.caja.models import MovimientoCaja
from apps.caja.servicios import mover_caja
from config.comunes import MedioPago
from config.formato import pesos
from config.vistas import anotar_actividad, validar

from .models import CuentaCorriente, PagoCuenta, PagoCuentaMovCaja


# ---------- Serializers ----------

class PagoCuentaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PagoCuenta
        fields = ["id_pago_cuenta", "fecha_hora", "importe", "medio_pago", "referencia_transferencia"]


class CuentaCorrienteSerializer(serializers.ModelSerializer):
    fecha = serializers.DateTimeField(source="venta.fecha", read_only=True)
    cliente = serializers.IntegerField(source="venta.cliente_id", read_only=True)
    cliente_nombre = serializers.CharField(source="venta.cliente.nombre", read_only=True)
    pagos = PagoCuentaSerializer(many=True, read_only=True)

    class Meta:
        model = CuentaCorriente
        fields = ["id_cuenta", "venta", "fecha", "cliente", "cliente_nombre",
                  "importe_original", "saldo_pendiente", "estado", "pagos"]


class CobroSerializer(serializers.Serializer):
    importe = serializers.DecimalField(max_digits=12, decimal_places=2)
    medio_pago = serializers.ChoiceField(choices=MedioPago.choices)
    referencia_transferencia = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate(self, datos):
        if datos["medio_pago"] == MedioPago.TRANSFERENCIA and not datos.get("referencia_transferencia", "").strip():
            raise serializers.ValidationError({"referencia_transferencia": "Anotá la referencia de la transferencia."})
        return datos


# ---------- Regla del cobro ----------

def cobrar_deuda(cuenta, datos, usuario):
    if cuenta.estado == CuentaCorriente.Estado.CANCELADA:
        raise ValidationError({"non_field_errors": "Esa deuda ya está cancelada."})
    if datos["importe"] != cuenta.saldo_pendiente:
        raise ValidationError({"importe": f"Se cobra el total de la deuda: {pesos(cuenta.saldo_pendiente)}."})

    pago = PagoCuenta.objects.create(
        cuenta=cuenta, importe=datos["importe"], medio_pago=datos["medio_pago"],
        referencia_transferencia=datos.get("referencia_transferencia") or None,
    )
    if datos["medio_pago"] == MedioPago.EFECTIVO:
        movimiento = mover_caja(MovimientoCaja.Tipo.COBRO_DEUDA_EFECTIVO, pago.importe, usuario)
        PagoCuentaMovCaja.objects.create(pago_cuenta=pago, movimiento_caja=movimiento)

    cuenta.saldo_pendiente = 0
    cuenta.estado = CuentaCorriente.Estado.CANCELADA
    cuenta.save(update_fields=["saldo_pendiente", "estado"])
    return cuenta


# ---------- API ----------

class CuentaCorrienteViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Deudas de los clientes.

    GET  /cuentas-corrientes/              lista. Filtros: ?cliente=<id>  ?estado=PENDIENTE|CANCELADA
    GET  /cuentas-corrientes/<id>/         una deuda con sus pagos (historial)
    POST /cuentas-corrientes/<id>/cobrar/  cobra el total; en efectivo entra a la caja
    """

    serializer_class = CuentaCorrienteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        cuentas = (CuentaCorriente.objects.select_related("venta__cliente")
                   .prefetch_related("pagos").order_by("-venta__fecha"))
        filtros = self.request.query_params
        if filtros.get("cliente"):
            cuentas = cuentas.filter(venta__cliente_id=filtros["cliente"])
        if filtros.get("estado"):
            cuentas = cuentas.filter(estado=filtros["estado"].upper())
        return cuentas

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cobrar(self, request, pk=None):
        datos = validar(CobroSerializer, request.data)
        cuenta = cobrar_deuda(self.get_object(), datos, request.user)
        anotar_actividad(request.user, "Cobro de deuda", cuenta)
        cuenta = self.get_queryset().get(pk=cuenta.pk)  # se vuelve a leer para incluir el pago nuevo
        return Response(CuentaCorrienteSerializer(cuenta).data, status=status.HTTP_200_OK)
