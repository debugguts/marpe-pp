from rest_framework import serializers

from config.validaciones import limpiar_nombre, limpiar_telefono

from .models import Proveedor


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id_proveedor", "nombre", "telefono", "direccion", "estado"]
        read_only_fields = ["id_proveedor"]

    def validate_nombre(self, valor):
        return limpiar_nombre(valor)

    def validate_telefono(self, valor):
        return limpiar_telefono(valor)
