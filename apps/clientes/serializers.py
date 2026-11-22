from rest_framework import serializers

from config.validaciones import limpiar_nombre, limpiar_telefono

from .models import Cliente


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id_cliente", "nombre", "telefono", "estado"]
        read_only_fields = ["id_cliente"]

    def validate_nombre(self, valor):
        repetidos = Cliente.objects.all()
        if self.instance:
            repetidos = repetidos.exclude(pk=self.instance.pk)
        return limpiar_nombre(valor, repetidos)

    def validate_telefono(self, valor):
        return limpiar_telefono(valor)
