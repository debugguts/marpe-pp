from datetime import date
from decimal import Decimal

from rest_framework import serializers

from .models import Gasto

IMPORTE_MAXIMO = Decimal("100000000")


class GastoSerializer(serializers.ModelSerializer):
    tipo_texto = serializers.CharField(source="get_tipo_display", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    importe = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"), max_value=IMPORTE_MAXIMO,
                                       error_messages={"min_value": "El importe tiene que ser mayor a 0.",
                                                       "max_value": "El importe no puede pasar de $ 100.000.000."})

    class Meta:
        model = Gasto
        fields = ["id_gasto", "fecha", "concepto", "categoria", "tipo", "tipo_texto",
                  "importe", "medio_pago", "usuario_nombre",
                  "estado", "fecha_modificacion", "fecha_anulacion", "motivo_anulacion"]
        read_only_fields = ["id_gasto", "estado", "fecha_modificacion", "fecha_anulacion", "motivo_anulacion"]

    def validate_fecha(self, valor):
        if valor > date.today():
            raise serializers.ValidationError("La fecha no puede ser posterior a hoy.")
        return valor

    def validate_concepto(self, valor):
        if len(valor.strip()) < 3:
            raise serializers.ValidationError("Escribí el concepto (al menos 3 letras).")
        return valor.strip()

    def validate_categoria(self, valor):
        if not valor.strip():
            raise serializers.ValidationError("Indicá la categoría.")
        return valor.strip()

    def validate(self, datos):
        if self.instance:
            if self.instance.estado == Gasto.Estado.ANULADO:
                raise serializers.ValidationError({"non_field_errors": "Este gasto está anulado: no se puede modificar."})
            # El importe y el medio de pago ya movieron la caja: no se cambian al editar.
            for campo in ("importe", "medio_pago"):
                if campo in datos and datos[campo] != getattr(self.instance, campo):
                    raise serializers.ValidationError(
                        {campo: "No se puede cambiar: si está mal, anulá el gasto y cargalo de nuevo."})
        return datos


class AnularGastoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=200, min_length=3, trim_whitespace=True, error_messages={
        "blank": "Escribí el motivo de la anulación.",
        "min_length": "Escribí el motivo de la anulación (al menos 3 letras).",
    })
