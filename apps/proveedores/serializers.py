from rest_framework import serializers

from config.comunes import Estado
from config.validaciones import limpiar_nombre, limpiar_telefono

from .models import CostoProveedor, Proveedor


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ["id_proveedor", "nombre", "telefono", "direccion", "estado"]
        read_only_fields = ["id_proveedor"]

    def validate_nombre(self, valor):
        return limpiar_nombre(valor)

    def validate_telefono(self, valor):
        return limpiar_telefono(valor)


class CostoProveedorSerializer(serializers.ModelSerializer):
    # Textos listos para mostrar en pantalla (solo lectura).
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)

    class Meta:
        model = CostoProveedor
        fields = [
            "id_costo",
            "proveedor", "proveedor_nombre",
            "producto", "producto_nombre",
            "presentacion", "presentacion_nombre",
            "precio_costo", "fecha_desde", "fecha_hasta",
        ]
        # El historial lo maneja el sistema: nadie escribe estas fechas a mano.
        read_only_fields = ["id_costo", "fecha_desde", "fecha_hasta"]
        validators = []  # la regla "un solo costo vigente" la resuelve la vista

    def validate_precio_costo(self, valor):
        if valor <= 0:
            raise serializers.ValidationError("El precio de costo tiene que ser mayor que 0.")
        return valor

    def validate_proveedor(self, proveedor):
        if proveedor.estado != Estado.ACTIVO:
            raise serializers.ValidationError(
                "Ese proveedor está dado de baja: no se le pueden cargar costos."
            )
        return proveedor
