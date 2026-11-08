from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.catalogo.views import PresentacionViewSet, ProductoViewSet
from apps.clientes.views import ClienteViewSet
from apps.proveedores.views import ProveedorViewSet
from apps.usuarios.views import LoginView, LogoutView, YoView

# Tablas maestras: el router arma solo las direcciones del ABM.
router = DefaultRouter()
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("productos", ProductoViewSet, basename="producto")
router.register("presentaciones", PresentacionViewSet, basename="presentacion")
router.register("clientes", ClienteViewSet, basename="cliente")

# Sesión: iniciar, cerrar y saber quién está conectado.
urlpatterns = router.urls + [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/yo/", YoView.as_view(), name="yo"),
]
