from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from config.permisos import ConsultaOAdministrador
from config.vistas import anotar_actividad, validar

from .models import Compra
from .serializers import CompraSerializer, NuevaCompraSerializer
from .servicios import registrar_compra


class CompraViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Compras a proveedores (HU-04).

    GET  /compras/        lista. Filtros: ?proveedor=<id>  ?desde=AAAA-MM-DD  ?hasta=AAAA-MM-DD
    POST /compras/        registra la compra y suma los huevos al stock
    GET  /compras/<id>/   compra con su detalle
    """

    serializer_class = CompraSerializer
    permission_classes = [ConsultaOAdministrador]  # el operador consulta; carga el administrador

    def get_queryset(self):
        compras = (Compra.objects.select_related("proveedor", "usuario")
                   .prefetch_related("detalles__producto", "detalles__presentacion")
                   .order_by("-fecha", "-id_compra"))
        filtros = self.request.query_params
        if filtros.get("proveedor"):
            compras = compras.filter(proveedor_id=filtros["proveedor"])
        if filtros.get("desde"):
            compras = compras.filter(fecha__gte=filtros["desde"])
        if filtros.get("hasta"):
            compras = compras.filter(fecha__lte=filtros["hasta"])
        return compras

    @transaction.atomic
    def create(self, request):
        datos = validar(NuevaCompraSerializer, request.data)
        compra = registrar_compra(datos, request.user)
        anotar_actividad(request.user, "Alta", compra)
        return Response(CompraSerializer(compra).data, status=status.HTTP_201_CREATED)
