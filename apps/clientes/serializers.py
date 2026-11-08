from rest_framework import serializers

from config.validaciones import limpiar_nombre, limpiar_telefono

from .models import Cliente


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id_cliente", "nombre", "telefono", "estado"]
        read_only_fields = ["id_cliente"]

    def validate_nombre(self, valor):
        return limpiar_nombre(valor)

    def validate_telefono(self, valor):
        return limpiar_telefono(valor)
