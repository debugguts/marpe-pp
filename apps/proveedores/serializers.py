import re

from rest_framework import serializers

from .models import Proveedor

TELEFONO = re.compile(r"^[0-9+\-\s()]{6,20}$")


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id_proveedor", "nombre", "telefono", "direccion", "estado"]
        read_only_fields = ["id_proveedor"]

    def validate_nombre(self, valor):
        valor = valor.strip()
        if len(valor) < 2:
            raise serializers.ValidationError(
                "Ingresá el nombre o la razón social (mínimo 2 caracteres)."
            )
        return valor

    def validate_telefono(self, valor):
        if valor in (None, ""):
            return None
        valor = valor.strip()
        if not TELEFONO.match(valor):
            raise serializers.ValidationError(
                "Usá solo números, espacios, guiones, + o paréntesis (6 a 20 caracteres)."
            )
        return valor
