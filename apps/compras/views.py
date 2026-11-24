from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from config.comprobantes import comprobante_compra
from config.permisos import ConsultaOAdministrador
from config.vistas import PaginaDelMes, anotar_actividad, validar

from .models import Compra
from .serializers import AnularCompraSerializer, CompraSerializer, ModificarCompraSerializer, NuevaCompraSerializer
from .servicios import anular_compra, modificar_compra, registrar_compra


class CompraViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Compras a proveedores (HU-04). No hay borrado.

    GET  /compras/              lista. Filtros: ?proveedor=<id>  ?estado=CONFIRMADA|ANULADA
                                ?desde=AAAA-MM-DD  ?hasta=AAAA-MM-DD
    POST /compras/              registra la compra y suma los huevos al stock
    GET  /compras/<id>/         compra con su detalle
    PUT  /compras/<id>/         modificación completa (solo administrador): mismos datos que el alta
    POST /compras/<id>/anular/  anulación con motivo (solo administrador): los huevos salen del stock
    GET  /compras/<id>/comprobante/  ticket de 80 mm de la compra, para dejarla registrada (no fiscal)
    DELETE no existe (405): la compra movió stock, así que se anula y queda el registro.
    """

    serializer_class = CompraSerializer
    permission_classes = [ConsultaOAdministrador]  # el operador consulta; carga, modifica y anula el administrador
    pagination_class = PaginaDelMes

    def get_queryset(self):
        compras = (Compra.objects.select_related("proveedor", "usuario")
                   .prefetch_related("detalles__producto", "detalles__presentacion")
                   .order_by("-fecha", "-id_compra"))
        filtros = self.request.query_params
        if filtros.get("proveedor"):
            compras = compras.filter(proveedor_id=filtros["proveedor"])
        if filtros.get("estado"):
            compras = compras.filter(estado=filtros["estado"].upper())
        if filtros.get("desde"):
            compras = compras.filter(fecha__gte=filtros["desde"])
        if filtros.get("hasta"):
            compras = compras.filter(fecha__lte=filtros["hasta"])
        return compras

    def compra_bloqueada(self):
        """Trae la compra reservada para esta transacción: nadie más la toca hasta terminar."""
        return Compra.objects.select_for_update().get(pk=self.get_object().pk)

    def respuesta(self, compra, codigo=status.HTTP_200_OK):
        return Response(CompraSerializer(self.get_queryset().get(pk=compra.pk)).data, status=codigo)

    @transaction.atomic
    def create(self, request):
        datos = validar(NuevaCompraSerializer, request.data)
        compra = registrar_compra(datos, request.user)
        anotar_actividad(request.user, "Alta", compra)
        return self.respuesta(compra, status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, pk=None, **kwargs):
        compra = self.compra_bloqueada()
        serializer = ModificarCompraSerializer(data=request.data, context={"compra": compra})
        serializer.is_valid(raise_exception=True)
        compra, como_estaba = modificar_compra(compra, serializer.validated_data, request.user)
        anotar_actividad(request.user, "Modificación", compra, detalle=f"Antes: {como_estaba}")
        return self.respuesta(compra)

    # PATCH hace lo mismo que PUT: la compra se manda completa porque hay que recalcular el stock.
    partial_update = update

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def anular(self, request, pk=None):
        compra = self.compra_bloqueada()
        motivo = validar(AnularCompraSerializer, request.data)["motivo"]
        anular_compra(compra, motivo, request.user)
        anotar_actividad(request.user, "Anulación", compra, detalle=f"Motivo: {motivo}")
        return self.respuesta(compra)

    @action(detail=True)
    def comprobante(self, request, pk=None):
        return comprobante_compra(self.get_object())
