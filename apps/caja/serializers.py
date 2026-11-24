from decimal import Decimal

from rest_framework import serializers

from config.permisos import es_administrador

from .models import Caja, MovimientoCaja
from .servicios import resumen_de_caja, saldo_actual


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


# Arqueo ciego: el operador cuenta el efectivo sin saber cuánto debería haber. Estos datos solo los
# recibe el administrador (sin el pedido en el contexto tampoco se mandan: ante la duda, se ocultan).
SOLO_ADMINISTRADOR = ("saldo_actual", "saldo_esperado", "diferencia", "resumen")


def ve_el_arqueo(contexto):
    pedido = (contexto or {}).get("request")
    return bool(pedido and es_administrador(pedido.user))


class CajaSerializer(serializers.ModelSerializer):
    # Abierta: lo que debería haber ahora. Cerrada: lo que debía haber al cerrar.
    saldo_actual = serializers.SerializerMethodField()
    usuario_apertura_nombre = serializers.SerializerMethodField()
    usuario_cierre_nombre = serializers.SerializerMethodField()
    resumen = serializers.SerializerMethodField()  # ventas y cobros por medio de pago en el turno

    class Meta:
        model = Caja
        fields = [
            "id_caja", "estado", "fecha_hora_apertura", "saldo_inicial", "saldo_actual",
            "usuario_apertura_nombre", "fecha_hora_cierre", "efectivo_contado",
            "saldo_esperado", "diferencia", "usuario_cierre_nombre", "resumen",
        ]

    def to_representation(self, caja):
        datos = super().to_representation(caja)
        datos["arqueo_ciego"] = not ve_el_arqueo(self.context)
        if datos["arqueo_ciego"]:
            for campo in SOLO_ADMINISTRADOR:
                datos.pop(campo, None)
        return datos

    def get_saldo_actual(self, caja):
        return str(caja.saldo_esperado if caja.estado == Caja.Estado.CERRADA else saldo_actual(caja))

    def get_resumen(self, caja):
        return {clave: str(valor) for clave, valor in resumen_de_caja(caja).items()}

    def get_usuario_apertura_nombre(self, caja):
        return nombre_de(caja.usuario_apertura)

    def get_usuario_cierre_nombre(self, caja):
        return nombre_de(caja.usuario_cierre)


# ---------- Lo que manda la pantalla ----------

MAXIMO = Decimal("100000000")
NO_NEGATIVO = {"min_value": "No puede ser negativo.", "max_value": "No puede pasar de $ 100.000.000."}


class AbrirCajaSerializer(serializers.Serializer):
    saldo_inicial = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"),
                                             max_value=MAXIMO, error_messages=NO_NEGATIVO)


class MovimientoManualSerializer(serializers.Serializer):
    """Ingreso o retiro extraordinario (HU-10-B): siempre con motivo."""

    tipo_movimiento = serializers.ChoiceField(choices=[
        (MovimientoCaja.Tipo.INGRESO_MANUAL, "Ingreso manual"),
        (MovimientoCaja.Tipo.RETIRO, "Retiro"),
    ])
    importe = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"), max_value=MAXIMO,
                                       error_messages={"min_value": "Tiene que ser mayor a $ 0.",
                                                       "max_value": "No puede pasar de $ 100.000.000."})
    motivo = serializers.CharField(max_length=200, min_length=3, trim_whitespace=True, error_messages={
        "blank": "Escribí el motivo.", "min_length": "El motivo tiene que tener al menos 3 letras."})


class CerrarCajaSerializer(serializers.Serializer):
    efectivo_contado = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"),
                                                max_value=MAXIMO, error_messages=NO_NEGATIVO)
