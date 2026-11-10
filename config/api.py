from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.caja.views import CajaViewSet
from apps.catalogo.views import PrecioViewSet, PresentacionViewSet, ProductoViewSet
from apps.clientes.views import ClienteViewSet
from apps.compras.views import CompraViewSet
from apps.proveedores.views import CostoProveedorViewSet, ProveedorViewSet
from apps.usuarios.views import LoginView, LogoutView, YoView
from apps.ventas.cuentas import CuentaCorrienteViewSet
from apps.ventas.views import VentaViewSet

# Tablas maestras: el router arma solo las direcciones del ABM.
router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("costos-proveedor", CostoProveedorViewSet, basename="costo-proveedor")
router.register("productos", ProductoViewSet, basename="producto")
router.register("presentaciones", PresentacionViewSet, basename="presentacion")
router.register("clientes", ClienteViewSet, basename="cliente")

# Movimientos (Sprint 5): piden haber iniciado sesión, porque guardan quién los hizo.
router.register("cajas", CajaViewSet, basename="caja")
router.register("compras", CompraViewSet, basename="compra")
router.register("ventas", VentaViewSet, basename="venta")
router.register("precios", PrecioViewSet, basename="precio")
router.register("cuentas-corrientes", CuentaCorrienteViewSet, basename="cuenta-corriente")

# Sesión: iniciar, cerrar y saber quién está conectado.
urlpatterns = router.urls + [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/yo/", YoView.as_view(), name="yo"),
]
