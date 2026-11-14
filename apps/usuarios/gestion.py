"""Gestión de usuarios y roles (HU-01): solo el administrador.

Rol = grupo de Django: «Administrador» u «Operador». El sistema siempre tiene que conservar
al menos un administrador activo, y nadie puede darse de baja a sí mismo.
Igual que en las tablas base, un usuario no se borra: se da de baja (is_active = False),
porque sus ventas, compras y movimientos quedan a su nombre.
"""

from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErrorDjango
from django.db import transaction
from rest_framework import filters, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from config.comunes import Estado
from config.permisos import EsAdministrador
from config.vistas import anotar_actividad

from .models import RegistroActividad, Usuario
from .serializers import rol_de

ROLES = [("Administrador", "Administrador"), ("Operador", "Operador")]


# ---------- Serializers ----------

class UsuarioSerializer(serializers.ModelSerializer):
    rol = serializers.ChoiceField(choices=ROLES, write_only=True)  # se lee con rol_de(), abajo
    clave = serializers.CharField(write_only=True, required=False, allow_blank=True,
                                  style={"input_type": "password"})
    nombre = serializers.SerializerMethodField()
    estado = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = ["id_usuario", "username", "first_name", "last_name", "nombre", "rol", "clave",
                  "estado", "last_login", "date_joined"]
        read_only_fields = ["id_usuario", "last_login", "date_joined"]
        extra_kwargs = {"username": {"error_messages": {"unique": "Ya existe un usuario con ese nombre."}}}

    def to_representation(self, usuario):
        datos = super().to_representation(usuario)
        datos["rol"] = rol_de(usuario)
        return datos

    def get_nombre(self, usuario):
        return usuario.get_full_name() or usuario.username

    def get_estado(self, usuario):
        return Estado.ACTIVO if usuario.is_active else Estado.INACTIVO

    def validate_username(self, valor):
        valor = valor.strip().lower()
        if len(valor) < 3:
            raise serializers.ValidationError("El usuario tiene que tener al menos 3 caracteres.")
        return valor

    def validate(self, datos):
        nueva = datos.get("clave")
        if self.instance is None and not nueva:
            raise serializers.ValidationError({"clave": "Escribí una clave para el usuario nuevo."})
        if nueva:
            try:
                validate_password(nueva)
            except ErrorDjango as error:
                raise serializers.ValidationError({"clave": list(error.messages)})
        # No dejar el sistema sin administrador.
        if (self.instance and datos.get("rol") == "Operador" and rol_de(self.instance) == "Administrador"
                and not otros_administradores(self.instance)):
            raise serializers.ValidationError({"rol": "Es el único administrador activo: primero nombrá a otro."})
        return datos

    @transaction.atomic
    def create(self, datos):
        rol, clave = datos.pop("rol"), datos.pop("clave")
        usuario = Usuario(**datos)
        usuario.set_password(clave)
        usuario.save()
        asignar_rol(usuario, rol)
        return usuario

    @transaction.atomic
    def update(self, usuario, datos):
        rol, clave = datos.pop("rol", None), datos.pop("clave", None)
        for campo, valor in datos.items():
            setattr(usuario, campo, valor)
        if clave:
            usuario.set_password(clave)
        usuario.save()
        if rol:
            asignar_rol(usuario, rol)
        return usuario


class ActividadSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True, default=None)

    class Meta:
        model = RegistroActividad
        fields = ["id_actividad", "fecha_hora", "usuario", "usuario_nombre", "operacion",
                  "entidad_afectada", "referencia_registro", "detalle"]


# ---------- Reglas ----------

def asignar_rol(usuario, rol):
    """Deja al usuario en un solo grupo. El administrador también entra al panel de Django."""
    grupo, _ = Group.objects.get_or_create(name=rol)
    usuario.groups.set([grupo])
    usuario.is_staff = rol == "Administrador"
    if rol == "Operador":
        usuario.is_superuser = False  # si no, rol_de() lo seguiría viendo como administrador
    usuario.save(update_fields=["is_staff", "is_superuser"])


def otros_administradores(usuario):
    return any(rol_de(u) == "Administrador"
               for u in Usuario.objects.filter(is_active=True).exclude(pk=usuario.pk))


# ---------- API ----------

class UsuarioViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Usuarios del sistema (HU-01). Solo administrador.

    GET    /usuarios/                 lista. Filtros: ?search=texto  ?estado=ACTIVO|INACTIVO
    POST   /usuarios/                 alta con rol y clave
    PATCH  /usuarios/<id>/            cambia nombre, rol o clave (la clave es opcional)
    DELETE /usuarios/<id>/            baja lógica: no puede volver a entrar, pero su historial queda
    POST   /usuarios/<id>/reactivar/  vuelve a habilitarlo
    """

    serializer_class = UsuarioSerializer
    permission_classes = [EsAdministrador]
    filter_backends = [filters.SearchFilter]
    search_fields = ["username", "first_name", "last_name"]

    def get_queryset(self):
        usuarios = Usuario.objects.prefetch_related("groups").order_by("username")
        estado = self.request.query_params.get("estado", "").upper()
        if estado:
            usuarios = usuarios.filter(is_active=estado == Estado.ACTIVO)
        return usuarios

    def perform_create(self, serializer):
        anotar_actividad(self.request.user, "Alta", serializer.save())

    def perform_update(self, serializer):
        anotar_actividad(self.request.user, "Modificación", serializer.save())

    def destroy(self, request, pk=None):
        usuario = self.get_object()
        if usuario == request.user:
            raise ValidationError({"non_field_errors": "No podés darte de baja a vos mismo."})
        if rol_de(usuario) == "Administrador" and not otros_administradores(usuario):
            raise ValidationError({"non_field_errors": "Es el único administrador activo: no se puede dar de baja."})
        usuario.is_active = False
        usuario.save(update_fields=["is_active"])
        anotar_actividad(request.user, "Baja", usuario)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def reactivar(self, request, pk=None):
        usuario = self.get_object()
        usuario.is_active = True
        usuario.save(update_fields=["is_active"])
        anotar_actividad(request.user, "Reactivación", usuario)
        return Response(UsuarioSerializer(usuario).data)


class ActividadViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Registro de actividad (HU-01-E): quién hizo qué y cuándo. Solo administrador, solo lectura.

    GET /actividad/   Filtros: ?usuario=<id>  ?entidad=Venta  ?operacion=Anulación  ?desde ?hasta
    """

    serializer_class = ActividadSerializer
    permission_classes = [EsAdministrador]

    def get_queryset(self):
        registros = RegistroActividad.objects.select_related("usuario").order_by("-fecha_hora")
        filtros = self.request.query_params
        if filtros.get("usuario"):
            registros = registros.filter(usuario_id=filtros["usuario"])
        if filtros.get("entidad"):
            registros = registros.filter(entidad_afectada=filtros["entidad"])
        if filtros.get("operacion"):
            registros = registros.filter(operacion=filtros["operacion"])
        if filtros.get("desde"):
            registros = registros.filter(fecha_hora__date__gte=filtros["desde"])
        if filtros.get("hasta"):
            registros = registros.filter(fecha_hora__date__lte=filtros["hasta"])
        return registros
