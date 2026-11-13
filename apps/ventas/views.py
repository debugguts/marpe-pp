from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permisos import EsAdministrador
from config.vistas import anotar_actividad, validar

from .models import Venta
from .serializers import AnularVentaSerializer, NuevaVentaSerializer, VentaSerializer
from .servicios import anular_venta, modificar_venta, registrar_venta


class VentaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Ventas (HU-05): alta, consulta, modificación y anulación. No hay borrado.

    GET  /ventas/              lista. Filtros: ?cliente=<id>  ?modalidad=CONTADO|FIADO
                               ?estado=CONFIRMADA|ANULADA  ?desde  ?hasta (AAAA-MM-DD)
    POST /ventas/              registra la venta: precio vigente, descuenta stock y cobra o fía
    GET  /ventas/<id>/         venta con su detalle y pagos
    PUT  /ventas/<id>/         modificación completa (solo administrador): mismos datos que el alta
    POST /ventas/<id>/anular/  anulación con motivo (solo administrador)
    DELETE no existe (405): una venta movió stock y caja, así que se anula y queda el registro.
    """

    serializer_class = VentaSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Vender lo hace cualquiera con sesión; corregir o anular, solo el administrador.
        if self.action in ("update", "partial_update", "anular"):
            return [EsAdministrador()]
        return super().get_permissions()

    def get_queryset(self):
        ventas = (Venta.objects.select_related("cliente", "usuario", "cuenta_corriente")
                  .prefetch_related("detalles__producto", "detalles__presentacion", "pagos")
                  .order_by("-fecha"))
        filtros = self.request.query_params
        if filtros.get("cliente"):
            ventas = ventas.filter(cliente_id=filtros["cliente"])
        if filtros.get("modalidad"):
            ventas = ventas.filter(modalidad=filtros["modalidad"].upper())
        if filtros.get("estado"):
            ventas = ventas.filter(estado=filtros["estado"].upper())
        if filtros.get("desde"):
            ventas = ventas.filter(fecha__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            ventas = ventas.filter(fecha__date__lte=filtros["hasta"])
        return ventas

    def venta_bloqueada(self, pk):
        """Trae la venta reservada para esta transacción: nadie más la toca hasta terminar."""
        return Venta.objects.select_for_update().get(pk=self.get_object().pk)

    def respuesta(self, venta, codigo=status.HTTP_200_OK):
        return Response(VentaSerializer(self.get_queryset().get(pk=venta.pk)).data, status=codigo)

    @transaction.atomic
    def create(self, request):
        datos = validar(NuevaVentaSerializer, request.data)
        venta = registrar_venta(datos, request.user)
        anotar_actividad(request.user, "Alta", venta)
        return self.respuesta(venta, status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, pk=None, **kwargs):
        venta = self.venta_bloqueada(pk)
        datos = validar(NuevaVentaSerializer, request.data)
        venta, como_estaba = modificar_venta(venta, datos, request.user)
        anotar_actividad(request.user, "Modificación", venta, detalle=f"Antes: {como_estaba}")
        return self.respuesta(venta)

    # PATCH hace lo mismo que PUT: la venta se manda completa porque hay que recalcular todo.
    partial_update = update

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def anular(self, request, pk=None):
        venta = self.venta_bloqueada(pk)
        motivo = validar(AnularVentaSerializer, request.data)["motivo"]
        anular_venta(venta, motivo, request.user)
        anotar_actividad(request.user, "Anulación", venta, detalle=f"Motivo: {motivo}")
        return self.respuesta(venta)
