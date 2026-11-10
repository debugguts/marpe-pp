from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.caja.views import CajaViewSet
from apps.catalogo.views import PresentacionViewSet, ProductoViewSet
from apps.clientes.views import ClienteViewSet
from apps.proveedores.views import CostoProveedorViewSet, ProveedorViewSet
from apps.usuarios.views import LoginView, LogoutView, YoView

# Tablas maestras: el router arma solo las direcciones del ABM.
router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("costos-proveedor", CostoProveedorViewSet, basename="costo-proveedor")
router.register("productos", ProductoViewSet, basename="producto")
router.register("presentaciones", PresentacionViewSet, basename="presentacion")
router.register("clientes", ClienteViewSet, basename="cliente")

# Movimientos (Sprint 5): piden haber iniciado sesión, porque guardan quién los hizo.
router.register("cajas", CajaViewSet, basename="caja")

# Sesión: iniciar, cerrar y saber quién está conectado.
urlpatterns = router.urls + [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/yo/", YoView.as_view(), name="yo"),
]
