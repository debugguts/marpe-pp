from config.vistas import ABMConBajaLogica

from .models import Presentacion, Producto
from .serializers import PresentacionSerializer, ProductoSerializer


class ProductoViewSet(ABMConBajaLogica):
    """ABM de productos: huevo por tipo y tamaño (HU-02-A, HU-02-B)."""

    modelo = Producto
    serializer_class = ProductoSerializer
    search_fields = ["tipo_huevo", "tamano"]
    ordering_fields = ["tipo_huevo", "tamano", "id_producto"]
    ordering = ["tipo_huevo", "tamano"]


class PresentacionViewSet(ABMConBajaLogica):
    """ABM de presentaciones: unidad, maple, cajón y su equivalencia en bandejas."""

    modelo = Presentacion
    serializer_class = PresentacionSerializer
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "cantidad_bandejas_equivalentes"]
    ordering = ["cantidad_bandejas_equivalentes"]
