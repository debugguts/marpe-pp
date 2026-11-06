from rest_framework import filters, viewsets

from config.comunes import Estado

from .models import Proveedor
from .serializers import ProveedorSerializer


class ProveedorViewSet(viewsets.ModelViewSet):
    """ABM de proveedores (HU-03).

    DELETE no borra el registro: lo da de baja (estado INACTIVO)
    para conservar las compras asociadas.
    Filtros: ?search=texto  ?estado=ACTIVO|INACTIVO  ?ordering=nombre
    """

    serializer_class = ProveedorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["nombre", "telefono"]
    ordering_fields = ["nombre", "id_proveedor"]
    ordering = ["nombre"]

    def get_queryset(self):
        qs = Proveedor.objects.all()
        estado = self.request.query_params.get("estado")
        if estado:
            qs = qs.filter(estado=estado.upper())
        return qs

    def perform_destroy(self, instance):
        instance.estado = Estado.INACTIVO
        instance.save(update_fields=["estado"])
