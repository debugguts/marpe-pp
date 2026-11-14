from django.db import transaction
from django.db.models import F
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.permisos import ConsultaOAdministrador
from config.vistas import anotar_actividad, validar

from .models import MovimientoInventario, Stock
from .serializers import MermaOAjusteSerializer, MovimientoInventarioSerializer, StockSerializer
from .servicios import a_bandejas, mover_stock


class StockViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                   viewsets.GenericViewSet):
    """Existencias por producto (HU-06-A/B).

    GET   /stock/                  stock de cada producto, en bandejas y por presentación. ?bajo_minimo=1
    PATCH /stock/<id_producto>/    cambia el stock mínimo (la cantidad solo cambia con movimientos)
    """

    serializer_class = StockSerializer
    permission_classes = [ConsultaOAdministrador]  # el stock mínimo lo cambia el administrador
    pagination_class = None

    def get_queryset(self):
        stock = Stock.objects.select_related("producto").order_by("producto__tipo_huevo", "producto__tamano")
        if self.request.query_params.get("bajo_minimo") == "1":
            stock = stock.filter(cantidad_bandejas__lt=F("stock_minimo_bandejas"))
        return stock


class MovimientoInventarioViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Movimientos de stock (HU-06-C, HU-08).

    GET  /movimientos-inventario/   lista. Filtros: ?producto=<id>  ?tipo=MERMA|...  ?desde ?hasta
    POST /movimientos-inventario/   carga una merma o un ajuste (las compras y ventas se cargan solas)
    """

    serializer_class = MovimientoInventarioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        movimientos = MovimientoInventario.objects.select_related("producto", "usuario").order_by("-fecha_hora")
        filtros = self.request.query_params
        if filtros.get("producto"):
            movimientos = movimientos.filter(producto_id=filtros["producto"])
        if filtros.get("tipo"):
            movimientos = movimientos.filter(tipo_movimiento=filtros["tipo"].upper())
        if filtros.get("desde"):
            movimientos = movimientos.filter(fecha_hora__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            movimientos = movimientos.filter(fecha_hora__date__lte=filtros["hasta"])
        return movimientos

    @transaction.atomic
    def create(self, request):
        datos = validar(MermaOAjusteSerializer, request.data)
        movimiento = mover_stock(
            datos["producto"], a_bandejas(datos["cantidad"], datos["presentacion"]),
            datos["tipo_movimiento"], request.user, datos["motivo"],
        )
        anotar_actividad(request.user, "Alta", movimiento)
        return Response(MovimientoInventarioSerializer(movimiento).data, status=status.HTTP_201_CREATED)
