from decimal import Decimal

from rest_framework import serializers

from apps.catalogo.models import SOLO_SUPER, Presentacion, Producto, presentacion_permitida
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

    def validate_cantidad(self, valor):
        # Se compran cajas, bandejas o unidades enteras: nunca 1,5.
        if valor != valor.to_integral_value():
            raise serializers.ValidationError("La cantidad va en números enteros, sin coma.")
        return valor


MAX_LINEAS = 50  # tope de líneas por operación (S-seguridad V2)


class NuevaCompraSerializer(serializers.Serializer):
    proveedor = serializers.PrimaryKeyRelatedField(
        queryset=Proveedor.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    fecha = serializers.DateField(required=False)  # si no viene, hoy
    # Como mucho 50 líneas por compra (S-seguridad V2)
    detalles = LineaCompraSerializer(many=True, allow_empty=False, max_length=MAX_LINEAS,
                                     error_messages={"max_length": f"Una compra puede tener como mucho {MAX_LINEAS} líneas."})

    def validate_detalles(self, lineas):
        combinaciones = [(l["producto"].pk, l["presentacion"].pk) for l in lineas]
        if len(combinaciones) != len(set(combinaciones)):
            raise serializers.ValidationError("Hay un producto repetido: juntá las cantidades en una sola línea.")
        if any(not presentacion_permitida(l["producto"], l["presentacion"]) for l in lineas):
            raise serializers.ValidationError(SOLO_SUPER)
        return lineas


class ModificarCompraSerializer(NuevaCompraSerializer):
    """Igual que el alta, pero acepta el proveedor que ya tenía la compra aunque hoy esté dado de baja."""

    proveedor = serializers.PrimaryKeyRelatedField(queryset=Proveedor.objects.all(), error_messages=ACTIVO)

    def validate_proveedor(self, proveedor):
        compra = self.context.get("compra")
        if proveedor.estado != Estado.ACTIVO and (compra is None or proveedor.pk != compra.proveedor_id):
            raise serializers.ValidationError(ACTIVO["does_not_exist"])
        return proveedor


class AnularCompraSerializer(serializers.Serializer):
    """Para anular hay que decir por qué: queda guardado en la compra."""

    motivo = serializers.CharField(max_length=200, min_length=3, trim_whitespace=True, error_messages={
        "blank": "Escribí el motivo de la anulación.",
        "min_length": "Escribí el motivo de la anulación (al menos 3 letras).",
    })


# ---------- Lo que devuelve la API ----------

class DetalleCompraSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)
    bandejas = serializers.SerializerMethodField()  # bandejas de 30 que sumó al stock

    class Meta:
        model = DetalleCompra
        fields = ["id_detalle_compra", "producto", "producto_nombre", "presentacion",
                  "presentacion_nombre", "cantidad", "precio_unitario", "subtotal", "bandejas"]

    def get_bandejas(self, detalle):
        return detalle.cantidad * detalle.presentacion.cantidad_bandejas_equivalentes


class CompraSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    detalles = DetalleCompraSerializer(many=True, read_only=True)

    class Meta:
        model = Compra
        fields = ["id_compra", "fecha", "proveedor", "proveedor_nombre", "total", "usuario_nombre", "detalles",
                  "estado", "fecha_modificacion", "fecha_anulacion", "motivo_anulacion"]
