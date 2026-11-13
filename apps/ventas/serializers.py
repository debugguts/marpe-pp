from decimal import Decimal

from rest_framework import serializers

from apps.catalogo.models import Presentacion, Producto
from apps.clientes.models import CONSUMIDOR_FINAL_ID, Cliente
from config.comunes import Estado, MedioPago

from .models import DetalleVenta, PagoVenta, Venta

ACTIVO = {"does_not_exist": "No existe o está dado de baja."}


# ---------- Lo que manda la pantalla de venta ----------

class LineaVentaSerializer(serializers.Serializer):
    """Una línea de la venta. El precio NO viene de la pantalla: se usa el vigente (HU-05-D)."""

    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    presentacion = serializers.PrimaryKeyRelatedField(
        queryset=Presentacion.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))


class NuevaVentaSerializer(serializers.Serializer):
    cliente = serializers.PrimaryKeyRelatedField(
        queryset=Cliente.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO,
        required=False, allow_null=True, default=None)
    modalidad = serializers.ChoiceField(choices=Venta.Modalidad.choices)
    medio_pago = serializers.ChoiceField(choices=MedioPago.choices, required=False, allow_null=True)
    referencia_transferencia = serializers.CharField(max_length=100, required=False, allow_blank=True)
    detalles = LineaVentaSerializer(many=True, allow_empty=False)

    def validate_detalles(self, lineas):
        combinaciones = [(l["producto"].pk, l["presentacion"].pk) for l in lineas]
        if len(combinaciones) != len(set(combinaciones)):
            raise serializers.ValidationError("Hay un producto repetido: juntá las cantidades en una sola línea.")
        return lineas

    def validate(self, datos):
        fiado = datos["modalidad"] == Venta.Modalidad.FIADO
        cliente = datos.get("cliente")
        if fiado and (cliente is None or cliente.pk == CONSUMIDOR_FINAL_ID):
            raise serializers.ValidationError({"cliente": "Para vender fiado elegí un cliente registrado."})
        if not fiado and not datos.get("medio_pago"):
            raise serializers.ValidationError({"medio_pago": "Elegí cómo paga: efectivo o transferencia."})
        if (not fiado and datos.get("medio_pago") == MedioPago.TRANSFERENCIA
                and not datos.get("referencia_transferencia", "").strip()):
            raise serializers.ValidationError(
                {"referencia_transferencia": "Anotá la referencia de la transferencia."})
        return datos


class AnularVentaSerializer(serializers.Serializer):
    """Para anular hay que decir por qué: queda guardado en la venta."""

    motivo = serializers.CharField(max_length=200, min_length=3, trim_whitespace=True, error_messages={
        "blank": "Escribí el motivo de la anulación.",
        "min_length": "Escribí el motivo de la anulación (al menos 3 letras).",
    })


# ---------- Lo que devuelve la API ----------

class DetalleVentaSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)

    class Meta:
        model = DetalleVenta
        fields = ["id_detalle_venta", "producto", "producto_nombre", "presentacion",
                  "presentacion_nombre", "cantidad", "precio_unitario_aplicado", "subtotal"]


class PagoVentaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PagoVenta
        fields = ["id_pago_venta", "fecha_hora", "medio_pago", "importe", "referencia_transferencia"]


class VentaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source="cliente.nombre", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    detalles = DetalleVentaSerializer(many=True, read_only=True)
    pagos = PagoVentaSerializer(many=True, read_only=True)
    saldo_pendiente = serializers.SerializerMethodField()  # solo en ventas fiadas

    class Meta:
        model = Venta
        fields = ["id_venta", "fecha", "modalidad", "cliente", "cliente_nombre", "total",
                  "saldo_pendiente", "usuario_nombre", "estado", "fecha_modificacion",
                  "fecha_anulacion", "motivo_anulacion", "detalles", "pagos"]

    def get_saldo_pendiente(self, venta):
        cuenta = getattr(venta, "cuenta_corriente", None) if venta.modalidad == Venta.Modalidad.FIADO else None
        return str(cuenta.saldo_pendiente) if cuenta else None
