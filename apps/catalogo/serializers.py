from decimal import Decimal

from rest_framework import serializers

from .models import PrecioProducto, Presentacion, Producto


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


class PrecioSerializer(serializers.ModelSerializer):
    """Precio de venta de un producto en una presentación (vigente si no tiene fecha_hasta)."""

    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)
    bandejas = serializers.DecimalField(
        source="presentacion.cantidad_bandejas_equivalentes", max_digits=12, decimal_places=6, read_only=True)
    stock_bandejas = serializers.SerializerMethodField()  # para avisar en la venta si no alcanza

    class Meta:
        model = PrecioProducto
        fields = ["id_precio", "producto", "producto_nombre", "presentacion", "presentacion_nombre",
                  "bandejas", "precio", "fecha_desde", "fecha_hasta", "stock_bandejas"]

    def get_stock_bandejas(self, precio):
        stock = getattr(precio.producto, "stock", None)
        return str(stock.cantidad_bandejas) if stock else "0"


class ConfirmarPrecioSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.filter(estado="ACTIVO"))
    presentacion = serializers.PrimaryKeyRelatedField(queryset=Presentacion.objects.filter(estado="ACTIVO"))
    precio = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    # Si el precio no cubre el equilibrio, la pantalla pide confirmarlo otra vez (HU-02-C).
    confirmar_bajo_equilibrio = serializers.BooleanField(default=False)
