from rest_framework.permissions import BasePermission

from apps.usuarios.serializers import rol_de


class EsAdministrador(BasePermission):
    """Deja pasar solo al rol Administrador (por ejemplo, para confirmar precios)."""

    message = "Solo el administrador puede hacer esto."

    def has_permission(self, request, view):
        return request.user.is_authenticated and rol_de(request.user) == "Administrador"
