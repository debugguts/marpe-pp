from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.vistas import anotar_actividad, validar

from . import servicios
from .models import Caja
from .serializers import (
    AbrirCajaSerializer,
    CajaSerializer,
    CerrarCajaSerializer,
    MovimientoCajaSerializer,
    MovimientoManualSerializer,
)


class CajaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Caja diaria (HU-10).

    GET  /cajas/                     historial de cajas. Filtros: ?desde=AAAA-MM-DD  ?hasta=AAAA-MM-DD
    POST /cajas/                     abrir la caja con el saldo inicial (solo puede haber una abierta)
    GET  /cajas/actual/              la caja abierta (o null si no hay)
    GET  /cajas/<id>/movimientos/    movimientos de esa caja
    POST /cajas/<id>/movimientos/    ingreso o retiro manual, con motivo
    POST /cajas/<id>/cerrar/         cierre con arqueo: efectivo contado vs. esperado
    """

    serializer_class = CajaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        cajas = Caja.objects.select_related("usuario_apertura", "usuario_cierre").order_by("-fecha_hora_apertura")
        filtros = self.request.query_params
        if filtros.get("desde"):
            cajas = cajas.filter(fecha_hora_apertura__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            cajas = cajas.filter(fecha_hora_apertura__date__lte=filtros["hasta"])
        return cajas

    @transaction.atomic
    def create(self, request):
        datos = validar(AbrirCajaSerializer, request.data)
        caja = servicios.abrir_caja(datos["saldo_inicial"], request.user)
        anotar_actividad(request.user, "Apertura", caja)
        return Response(CajaSerializer(caja).data, status=status.HTTP_201_CREATED)

    @action(detail=False)
    def actual(self, request):
        caja = self.get_queryset().filter(estado=Caja.Estado.ABIERTA).first()
        return Response(CajaSerializer(caja).data if caja else None)

    @action(detail=True, methods=["get", "post"])
    def movimientos(self, request, pk=None):
        caja = self.get_object()
        if request.method == "GET":
            movimientos = caja.movimientos.select_related("usuario").order_by("-fecha_hora")
            return Response(MovimientoCajaSerializer(movimientos, many=True).data)

        datos = validar(MovimientoManualSerializer, request.data)
        with transaction.atomic():
            if caja.estado == Caja.Estado.CERRADA:
                raise ValidationError({"non_field_errors": "Esa caja está cerrada: no se le pueden cargar movimientos."})
            movimiento = servicios.mover_caja(
                datos["tipo_movimiento"], datos["importe"], request.user, datos["motivo"]
            )
            anotar_actividad(request.user, "Alta", movimiento)
        return Response(MovimientoCajaSerializer(movimiento).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cerrar(self, request, pk=None):
        datos = validar(CerrarCajaSerializer, request.data)
        caja = servicios.cerrar_caja(self.get_object(), datos["efectivo_contado"], request.user)
        anotar_actividad(request.user, "Cierre", caja)
        return Response(CajaSerializer(caja).data)

