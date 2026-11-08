from rest_framework.exceptions import PermissionDenied

from config.vistas import ABMConBajaLogica

from .models import CONSUMIDOR_FINAL_ID, Cliente
from .serializers import ClienteSerializer

MENSAJE_PROTEGIDO = (
    "«Consumidor final» es un cliente del sistema: no se puede modificar ni dar de baja."
)


class ClienteViewSet(ABMConBajaLogica):
    """ABM de clientes (HU-07-A, HU-07-B).

    Regla del negocio: «Consumidor final» (id 1) se usa en las ventas sin cliente
    identificado, por eso está protegido contra modificación y baja.
    """

    modelo = Cliente
    serializer_class = ClienteSerializer
    search_fields = ["nombre", "telefono"]
    ordering_fields = ["nombre", "id_cliente"]
    ordering = ["nombre"]

    def proteger_consumidor_final(self, cliente):
        if cliente.pk == CONSUMIDOR_FINAL_ID:
            raise PermissionDenied(MENSAJE_PROTEGIDO)

    def perform_update(self, serializer):
        self.proteger_consumidor_final(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self.proteger_consumidor_final(instance)
        super().perform_destroy(instance)
