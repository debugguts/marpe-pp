from rest_framework import serializers

from .models import Usuario


def rol_de(usuario):
    """Devuelve el rol para mostrar: Administrador u Operador.

    Es Administrador si es superusuario o si está en el grupo "Administrador".
    """
    if usuario.is_superuser or usuario.groups.filter(name="Administrador").exists():
        return "Administrador"
    return "Operador"


class LoginSerializer(serializers.Serializer):
    """Datos que manda la pantalla de inicio de sesión."""

    usuario = serializers.CharField()
    clave = serializers.CharField(write_only=True, style={"input_type": "password"})


class UsuarioActualSerializer(serializers.ModelSerializer):
    """Datos del usuario conectado que necesita la web (nombre y rol)."""

    nombre = serializers.SerializerMethodField()
    rol = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id_usuario", "username", "nombre", "rol"]

    def get_nombre(self, usuario):
        return usuario.get_full_name() or usuario.username

    def get_rol(self, usuario):
        return rol_de(usuario)
