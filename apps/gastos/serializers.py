from decimal import Decimal

from rest_framework import serializers

from .models import Gasto


class GastoSerializer(serializers.ModelSerializer):
    tipo_texto = serializers.CharField(source="get_tipo_display", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)
    importe = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))

    class Meta:
        model = Gasto
        fields = ["id_gasto", "fecha", "concepto", "categoria", "tipo", "tipo_texto",
                  "importe", "medio_pago", "usuario_nombre"]
        read_only_fields = ["id_gasto"]

    def validate(self, datos):
        # El importe y el medio de pago ya movieron la caja: no se cambian al editar.
        if self.instance:
            for campo in ("importe", "medio_pago"):
                if campo in datos and datos[campo] != getattr(self.instance, campo):
                    raise serializers.ValidationError(
                        {campo: "No se puede cambiar: si está mal, anulá el gasto y cargalo de nuevo."})
        return datos
