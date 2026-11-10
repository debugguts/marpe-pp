from decimal import Decimal

from rest_framework import serializers

from .models import Caja, MovimientoCaja
from .servicios import saldo_actual


def nombre_de(usuario):
    return (usuario.get_full_name() or usuario.username) if usuario else None


# ---------- Lo que devuelve la API ----------

class MovimientoCajaSerializer(serializers.ModelSerializer):
    tipo_texto = serializers.CharField(source="get_tipo_movimiento_display", read_only=True)
    usuario_nombre = serializers.SerializerMethodField()

    class Meta:
        model = MovimientoCaja
        fields = ["id_movimiento_caja", "fecha_hora", "tipo_movimiento", "tipo_texto", "importe", "motivo", "usuario_nombre"]

    def get_usuario_nombre(self, movimiento):
        return nombre_de(movimiento.usuario)


class CajaSerializer(serializers.ModelSerializer):
    # Abierta: lo que debería haber ahora. Cerrada: lo que debía haber al cerrar.
    saldo_actual = serializers.SerializerMethodField()
    usuario_apertura_nombre = serializers.SerializerMethodField()
    usuario_cierre_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Caja
        fields = [
            "id_caja", "estado", "fecha_hora_apertura", "saldo_inicial", "saldo_actual",
            "usuario_apertura_nombre", "fecha_hora_cierre", "efectivo_contado",
            "saldo_esperado", "diferencia", "usuario_cierre_nombre",
        ]

    def get_saldo_actual(self, caja):
        return str(caja.saldo_esperado if caja.estado == Caja.Estado.CERRADA else saldo_actual(caja))

    def get_usuario_apertura_nombre(self, caja):
        return nombre_de(caja.usuario_apertura)

    def get_usuario_cierre_nombre(self, caja):
        return nombre_de(caja.usuario_cierre)


# ---------- Lo que manda la pantalla ----------

class AbrirCajaSerializer(serializers.Serializer):
    saldo_inicial = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))


class MovimientoManualSerializer(serializers.Serializer):
    """Ingreso o retiro extraordinario (HU-10-B): siempre con motivo."""

    tipo_movimiento = serializers.ChoiceField(choices=[
        (MovimientoCaja.Tipo.INGRESO_MANUAL, "Ingreso manual"),
        (MovimientoCaja.Tipo.RETIRO, "Retiro"),
    ])
    importe = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    motivo = serializers.CharField(max_length=200)


class CerrarCajaSerializer(serializers.Serializer):
    efectivo_contado = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
