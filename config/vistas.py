from rest_framework import filters, viewsets

from apps.usuarios.models import RegistroActividad
from config.comunes import Estado


class ABMConBajaLogica(viewsets.ModelViewSet):
    """Base de las APIs de tablas maestras (proveedores, productos, presentaciones...).

    Endpoints que genera:
      GET    /recurso/          lista paginada. Filtros: ?search=texto  ?estado=ACTIVO|INACTIVO
      POST   /recurso/          alta
      GET    /recurso/<id>/     consulta
      PUT    /recurso/<id>/     modificación (PATCH para modificar solo algunos campos)
      DELETE /recurso/<id>/     baja lógica: pasa a INACTIVO y NO se borra,
                                para conservar el historial (compras, ventas, precios).

    Cada alta, modificación y baja queda anotada en REGISTRO_ACTIVIDAD (HU-01-E).
    Cada vista hija solo define: modelo, serializer y campos de búsqueda/orden.
    """

    modelo = None
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        registros = self.modelo.objects.all()
        estado = self.request.query_params.get("estado")
        if estado:
            registros = registros.filter(estado=estado.upper())
        return registros

    def perform_create(self, serializer):
        registro = serializer.save()
        self.anotar_actividad("Alta", registro)

    def perform_update(self, serializer):
        registro = serializer.save()
        self.anotar_actividad("Modificación", registro)

    def perform_destroy(self, instance):
        instance.estado = Estado.INACTIVO
        instance.save(update_fields=["estado"])
        self.anotar_actividad("Baja", instance)

    def anotar_actividad(self, operacion, registro):
        anotar_actividad(self.request.user, operacion, registro)


def anotar_actividad(usuario, operacion, registro):
    """Deja constancia de quién hizo qué, sobre qué registro y cuándo (HU-01-E).

    La usan los ABM de arriba y también los movimientos (compras, ventas, caja...).
    """
    RegistroActividad.objects.create(
        usuario=usuario if usuario.is_authenticated else None,
        operacion=operacion,
        entidad_afectada=type(registro).__name__,  # por ejemplo "Proveedor" o "Venta"
        referencia_registro=str(registro.pk),
        detalle=str(registro),
    )


def validar(serializer_class, datos):
    """Valida lo que mandó la pantalla; si algo está mal, responde 400 con el detalle por campo."""
    serializer = serializer_class(data=datos)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
