"""Quién puede hacer qué en la API (S4-06, taller de seguridad).

- Sin sesión no se usa nada salvo el login (regla general en settings.py: IsAuthenticated).
- Operador: vende, cobra deudas, opera la caja, carga mermas y da de alta clientes; consulta lo demás.
- Administrador: además gestiona proveedores, productos, presentaciones, costos, precios,
  compras, gastos, stock mínimo, usuarios, y modifica o anula ventas.
La pantalla esconde lo que el rol no puede usar, pero la regla de verdad está acá, en el servidor.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.usuarios.serializers import rol_de


def es_administrador(usuario):
    return usuario.is_authenticated and rol_de(usuario) == "Administrador"


class EsAdministrador(BasePermission):
    """Deja pasar solo al rol Administrador (por ejemplo, para confirmar precios)."""

    message = "Solo el administrador puede hacer esto."

    def has_permission(self, request, view):
        return es_administrador(request.user)


class ConsultaOAdministrador(BasePermission):
    """Con sesión se puede consultar (GET); cargar, modificar o dar de baja, solo el administrador."""

    message = "Solo el administrador puede cargar o cambiar estos datos."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.method in SAFE_METHODS or es_administrador(request.user)
