from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path

from config.salud import salud
from config.spa import pantalla

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/salud/", salud, name="salud"),
    path("api/", include("config.api")),
]

# Producción: Django entrega también la pantalla de React (en desarrollo la sirve Vite o nginx).
if settings.FRONTEND_DIST:
    urlpatterns.append(re_path(r"^(?!api/|admin/|static/)(?P<ruta>.*)$", pantalla))

