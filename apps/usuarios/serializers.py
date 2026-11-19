from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErrorDjango
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
        fields = ["id_usuario", "username", "first_name", "last_name", "nombre", "email", "rol"]

    def get_nombre(self, usuario):
        return usuario.get_full_name() or usuario.username

    def get_rol(self, usuario):
        return rol_de(usuario)


class PerfilSerializer(serializers.ModelSerializer):
    """Lo que cada usuario puede cambiar de sí mismo desde "Editar perfil": su nombre y su clave.

    El usuario, el email (con él entra a la app móvil) y el rol los cambia solo el Administrador.
    Para poner una clave nueva hay que escribir la actual.
    """

    clave_actual = serializers.CharField(write_only=True, required=False, allow_blank=True,
                                         style={"input_type": "password"})
    clave_nueva = serializers.CharField(write_only=True, required=False, allow_blank=True,
                                        style={"input_type": "password"})

    class Meta:
        model = Usuario
        fields = ["first_name", "last_name", "clave_actual", "clave_nueva"]
        extra_kwargs = {"first_name": {"max_length": 150}, "last_name": {"max_length": 150}}

    def validate(self, datos):
        nueva = datos.get("clave_nueva")
        if nueva:
            if not self.instance.check_password(datos.get("clave_actual") or ""):
                raise serializers.ValidationError({"clave_actual": "La clave actual no es correcta."})
            try:
                validate_password(nueva, self.instance)
            except ErrorDjango as error:
                raise serializers.ValidationError({"clave_nueva": list(error.messages)})
        return datos

    def update(self, usuario, datos):
        datos.pop("clave_actual", None)
        nueva = datos.pop("clave_nueva", None)
        for campo, valor in datos.items():
            setattr(usuario, campo, valor.strip())
        if nueva:
            usuario.set_password(nueva)
        usuario.save()
        return usuario
