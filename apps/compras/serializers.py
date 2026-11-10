from decimal import Decimal

from rest_framework import serializers

from apps.catalogo.models import Presentacion, Producto
from apps.proveedores.models import Proveedor
from config.comunes import Estado

from .models import Compra, DetalleCompra

ACTIVO = {"does_not_exist": "No existe o está dado de baja."}


# ---------- Lo que manda la pantalla ----------

class LineaCompraSerializer(serializers.Serializer):
    """Una línea de la compra: 2 cajas de Blanco Mediano a $ 40.000."""

    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    presentacion = serializers.PrimaryKeyRelatedField(
        queryset=Presentacion.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    # Opcional: si no viene, se usa el costo vigente que tiene cargado el proveedor.
    precio_unitario = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False)


class NuevaCompraSerializer(serializers.Serializer):
    proveedor = serializers.PrimaryKeyRelatedField(
        queryset=Proveedor.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    fecha = serializers.DateField(required=False)  # si no viene, hoy
    detalles = LineaCompraSerializer(many=True, allow_empty=False)

    def validate_detalles(self, lineas):
        combinaciones = [(l["producto"].pk, l["presentacion"].pk) for l in lineas]
        if len(combinaciones) != len(set(combinaciones)):
            raise serializers.ValidationError("Hay un producto repetido: juntá las cantidades en una sola línea.")
        return lineas


# ---------- Lo que devuelve la API ----------

class DetalleCompraSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)

    class Meta:
        model = DetalleCompra
        fields = ["id_detalle_compra", "producto", "producto_nombre", "presentacion",
                  "presentacion_nombre", "cantidad", "precio_unitario", "subtotal"]


class CompraSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    detalles = DetalleCompraSerializer(many=True, read_only=True)

    class Meta:
        model = Compra
        fields = ["id_compra", "fecha", "proveedor", "proveedor_nombre", "total", "usuario_nombre", "detalles"]
