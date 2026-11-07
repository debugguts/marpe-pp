from rest_framework import filters, viewsets

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

    def perform_destroy(self, instance):
        instance.estado = Estado.INACTIVO
        instance.save(update_fields=["estado"])
