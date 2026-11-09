from rest_framework.routers import DefaultRouter

from apps.catalogo.views import PresentacionViewSet, ProductoViewSet
from apps.clientes.views import ClienteViewSet
from apps.proveedores.views import ProveedorViewSet

router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("productos", ProductoViewSet, basename="producto")
router.register("presentaciones", PresentacionViewSet, basename="presentacion")
router.register("clientes", ClienteViewSet, basename="cliente")

urlpatterns = router.urls
