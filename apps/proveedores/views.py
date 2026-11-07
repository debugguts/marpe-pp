from config.vistas import ABMConBajaLogica

from .models import Proveedor
from .serializers import ProveedorSerializer


class ProveedorViewSet(ABMConBajaLogica):
    """ABM de proveedores (HU-03)."""

    modelo = Proveedor
    serializer_class = ProveedorSerializer
    search_fields = ["nombre", "telefono"]
    ordering_fields = ["nombre", "id_proveedor"]
    ordering = ["nombre"]
