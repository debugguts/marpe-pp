from rest_framework import serializers

from .models import Presentacion, Producto


class ProductoSerializer(serializers.ModelSerializer):
    # Texto listo para mostrar en pantalla, por ejemplo "Blanco Selección".
    nombre = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Producto
        fields = ["id_producto", "nombre", "tipo_huevo", "tamano", "estado"]
        read_only_fields = ["id_producto"]
        # La regla "tipo + tamaño único" la validamos en validate() con un mensaje claro.
        validators = []

    def validate(self, datos):
        tipo = datos.get("tipo_huevo", getattr(self.instance, "tipo_huevo", None))
        tamano = datos.get("tamano", getattr(self.instance, "tamano", None))
        repetido = Producto.objects.filter(tipo_huevo=tipo, tamano=tamano)
        if self.instance:  # al modificar, no compararlo consigo mismo
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError("Ya existe un producto con ese tipo y tamaño.")
        return datos


class PresentacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presentacion
        fields = ["id_presentacion", "nombre", "cantidad_bandejas_equivalentes", "estado"]
        read_only_fields = ["id_presentacion"]

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Ingresá el nombre de la presentación.")
        return valor

    def validate_cantidad_bandejas_equivalentes(self, valor):
        if valor <= 0:
            raise serializers.ValidationError(
                "La equivalencia tiene que ser mayor que 0 (por ejemplo, 1 cajón = 12 bandejas)."
            )
        return valor
