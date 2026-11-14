from datetime import date

from django.db import transaction
from rest_framework import mixins, serializers, viewsets

from config.permisos import ConsultaOAdministrador
from config.vistas import ABMConBajaLogica

from .models import CostoProveedor, Proveedor
from .serializers import CostoProveedorSerializer, ProveedorSerializer


class ProveedorViewSet(ABMConBajaLogica):
    """ABM de proveedores (HU-03)."""

    permission_classes = [ConsultaOAdministrador]

    modelo = Proveedor
    serializer_class = ProveedorSerializer
    search_fields = ["nombre", "telefono"]
    ordering_fields = ["nombre", "id_proveedor"]
    ordering = ["nombre"]


def nuevo_costo_vigente(proveedor, producto, presentacion, precio_costo):
    """Regla del historial de costos (HU-03-D), en un solo lugar.

    1) Cierra el costo vigente de esa combinación con la fecha de hoy (pasa al historial).
    2) Crea el costo nuevo, que queda como vigente.
    """
    CostoProveedor.objects.filter(
        proveedor=proveedor,
        producto=producto,
        presentacion=presentacion,
        fecha_hasta__isnull=True,
    ).update(fecha_hasta=date.today())
    return CostoProveedor.objects.create(
        proveedor=proveedor,
        producto=producto,
        presentacion=presentacion,
        precio_costo=precio_costo,
    )


class CostoProveedorViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Costos que cotiza cada proveedor (HU-03-D).

    POST  /costos-proveedor/        carga el precio de una combinación proveedor-producto-presentación
    PATCH /costos-proveedor/<id>/   cambia el precio: el sistema guarda el anterior en el historial
    No se pueden borrar. Filtros: ?proveedor=<id>  ?producto=<id>  ?vigentes=1
    """

    permission_classes = [ConsultaOAdministrador]

    serializer_class = CostoProveedorSerializer

    def get_queryset(self):
        costos = CostoProveedor.objects.select_related("proveedor", "producto", "presentacion")
        filtros = self.request.query_params
        if filtros.get("proveedor"):
            costos = costos.filter(proveedor_id=filtros["proveedor"])
        if filtros.get("producto"):
            costos = costos.filter(producto_id=filtros["producto"])
        if filtros.get("vigentes") == "1":
            costos = costos.filter(fecha_hasta__isnull=True)
        return costos.order_by("-fecha_desde", "-id_costo")

    @transaction.atomic
    def perform_create(self, serializer):
        datos = serializer.validated_data
        serializer.instance = nuevo_costo_vigente(
            datos["proveedor"], datos["producto"], datos["presentacion"], datos["precio_costo"]
        )

    @transaction.atomic
    def perform_update(self, serializer):
        actual = serializer.instance
        if actual.fecha_hasta is not None:
            raise serializers.ValidationError("Ese precio ya es historial: cambiá el precio vigente.")
        if "precio_costo" not in serializer.validated_data:
            raise serializers.ValidationError({"precio_costo": "Indicá el precio nuevo."})
        # Se cambia solo el precio: proveedor, producto y presentación siguen siendo los mismos.
        serializer.instance = nuevo_costo_vigente(
            actual.proveedor, actual.producto, actual.presentacion,
            serializer.validated_data["precio_costo"],
        )
