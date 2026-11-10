from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.vistas import anotar_actividad, validar

from .models import Venta
from .serializers import NuevaVentaSerializer, VentaSerializer
from .servicios import registrar_venta


class VentaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Ventas (HU-05).

    GET  /ventas/        lista. Filtros: ?cliente=<id>  ?modalidad=CONTADO|FIADO  ?desde  ?hasta (AAAA-MM-DD)
    POST /ventas/        registra la venta: precio vigente, descuenta stock y cobra o fía
    GET  /ventas/<id>/   venta con su detalle y pagos
    No hay modificación: el precio de una venta confirmada no se toca (HU-05-D).
    """

    serializer_class = VentaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        ventas = (Venta.objects.select_related("cliente", "usuario", "cuenta_corriente")
                  .prefetch_related("detalles__producto", "detalles__presentacion", "pagos")
                  .order_by("-fecha"))
        filtros = self.request.query_params
        if filtros.get("cliente"):
            ventas = ventas.filter(cliente_id=filtros["cliente"])
        if filtros.get("modalidad"):
            ventas = ventas.filter(modalidad=filtros["modalidad"].upper())
        if filtros.get("desde"):
            ventas = ventas.filter(fecha__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            ventas = ventas.filter(fecha__date__lte=filtros["hasta"])
        return ventas

    @transaction.atomic
    def create(self, request):
        datos = validar(NuevaVentaSerializer, request.data)
        venta = registrar_venta(datos, request.user)
        anotar_actividad(request.user, "Alta", venta)
        return Response(VentaSerializer(venta).data, status=status.HTTP_201_CREATED)
