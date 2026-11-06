from rest_framework.routers import DefaultRouter

from apps.proveedores.views import ProveedorViewSet

router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")

urlpatterns = router.urls
