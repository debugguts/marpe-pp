from datetime import date

from django.db import transaction
from django.db.models import Sum
from rest_framework import filters, mixins, viewsets
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.caja.models import MovimientoCaja
from apps.caja.servicios import mover_caja
from apps.catalogo.precios import mes_actual
from config.permisos import ConsultaOAdministrador
from config.comunes import MedioPago
from config.vistas import anotar_actividad, validar

from .models import Gasto, GastoMovCaja
from .serializers import AnularGastoSerializer, GastoSerializer


class GastoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Gastos del negocio (HU-09).

    GET   /gastos/            lista. Filtros: ?desde ?hasta (AAAA-MM-DD)  ?tipo=FIJO|VARIABLE  ?search=texto
    POST  /gastos/            alta; si se paga en efectivo, sale de la caja abierta
    PATCH /gastos/<id>/       corrige fecha, concepto, categoría o tipo (el importe no)
    POST  /gastos/<id>/anular/ anula con motivo; si fue en efectivo, la plata vuelve a la caja abierta
    ?estado=CONFIRMADO|ANULADO en la lista. DELETE no existe (405): se anula y queda el registro.
    GET   /gastos/resumen/    totales del mes: fijos, variables y por categoría (?mes=AAAA-MM)
    """

    serializer_class = GastoSerializer
    permission_classes = [ConsultaOAdministrador]  # el operador consulta; carga el administrador
    filter_backends = [filters.SearchFilter]
    search_fields = ["concepto", "categoria"]

    def get_queryset(self):
        gastos = Gasto.objects.select_related("usuario").order_by("-fecha", "-id_gasto")
        filtros = self.request.query_params
        if filtros.get("desde"):
            gastos = gastos.filter(fecha__gte=filtros["desde"])
        if filtros.get("hasta"):
            gastos = gastos.filter(fecha__lte=filtros["hasta"])
        if filtros.get("tipo"):
            gastos = gastos.filter(tipo=filtros["tipo"].upper())
        if filtros.get("estado"):
            gastos = gastos.filter(estado=filtros["estado"].upper())
        return gastos

    @transaction.atomic
    def perform_create(self, serializer):
        gasto = serializer.save(usuario=self.request.user)
        if gasto.medio_pago == MedioPago.EFECTIVO:
            movimiento = mover_caja(MovimientoCaja.Tipo.GASTO_EFECTIVO, gasto.importe, self.request.user, gasto.concepto)
            GastoMovCaja.objects.create(gasto=gasto, movimiento_caja=movimiento)
        anotar_actividad(self.request.user, "Alta", gasto)

    def perform_update(self, serializer):
        anotar_actividad(self.request.user, "Modificación", serializer.save(fecha_modificacion=timezone.now()))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def anular(self, request, pk=None):
        gasto = Gasto.objects.select_for_update().get(pk=self.get_object().pk)
        motivo = validar(AnularGastoSerializer, request.data)["motivo"]
        if gasto.estado == Gasto.Estado.ANULADO:
            raise ValidationError({"non_field_errors": "Este gasto ya está anulado."})
        if gasto.medio_pago == MedioPago.EFECTIVO:  # la plata que salió de la caja vuelve a entrar
            mover_caja(MovimientoCaja.Tipo.INGRESO_MANUAL, gasto.importe, request.user,
                       f"Anulación del gasto {gasto.pk}: {motivo}"[:200])
        gasto.estado = Gasto.Estado.ANULADO
        gasto.motivo_anulacion = motivo
        gasto.fecha_anulacion = timezone.now()
        gasto.save(update_fields=["estado", "motivo_anulacion", "fecha_anulacion"])
        anotar_actividad(request.user, "Anulación", gasto, detalle=f"Motivo: {motivo}")
        return Response(GastoSerializer(gasto).data)

    @action(detail=False)
    def resumen(self, request):
        mes = request.query_params.get("mes")  # "2026-11"
        dia = date.fromisoformat(f"{mes}-01") if mes else date.today()
        desde, hasta = mes_actual(dia)
        gastos = Gasto.objects.filter(fecha__range=(desde, hasta)).exclude(estado=Gasto.Estado.ANULADO)

        def total(registros):
            return registros.aggregate(t=Sum("importe"))["t"] or 0

        return Response({
            "desde": desde, "hasta": hasta,
            "total": total(gastos),
            "fijos": total(gastos.filter(tipo=Gasto.Tipo.FIJO)),
            "variables": total(gastos.filter(tipo=Gasto.Tipo.VARIABLE)),
            "por_categoria": list(gastos.values("categoria").annotate(total=Sum("importe")).order_by("-total")),
        })
