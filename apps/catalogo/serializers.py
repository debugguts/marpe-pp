from decimal import Decimal

from rest_framework import serializers

from .models import SOLO_SUPER, PrecioProducto, Presentacion, Producto, presentacion_permitida


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
        fields = ["id_presentacion", "nombre", "cantidad_bandejas_equivalentes", "formato", "huevos_por_bandeja", "estado"]
        read_only_fields = ["id_presentacion"]

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Ingresá el nombre de la presentación.")
        if len(valor) < 3:
            raise serializers.ValidationError("El nombre tiene que tener al menos 3 letras.")
        if not any(c.isalpha() for c in valor):
            raise serializers.ValidationError("El nombre tiene que tener letras, no solo números o signos.")
        repetida = Presentacion.objects.filter(nombre__iexact=valor)
        if self.instance:
            repetida = repetida.exclude(pk=self.instance.pk)
        if repetida.exists():
            raise serializers.ValidationError("Ya hay una presentación con ese nombre.")
        return valor

    def validate_cantidad_bandejas_equivalentes(self, valor):
        if valor <= 0:
            raise serializers.ValidationError(
                "La equivalencia tiene que ser mayor que 0 (por ejemplo, 1 cajón = 6 bandejas)."
            )
        if valor > 50:
            raise serializers.ValidationError("Una presentación no puede pasar de 50 bandejas.")
        return valor

    def validate(self, datos):
        # Lo que se elige (formato y bandeja de 20 o 30) tiene que coincidir con la equivalencia.
        equivalencia = datos.get("cantidad_bandejas_equivalentes", getattr(self.instance, "cantidad_bandejas_equivalentes", None))
        if "formato" not in datos and self.instance is None and equivalencia is not None:
            # Si no se indica, se deduce de la equivalencia (como hace la migración).
            datos["formato"] = "UNIDAD" if equivalencia < Decimal("0.1") else "CAJA" if equivalencia >= 2 else "BANDEJA"
        formato = datos.get("formato", getattr(self.instance, "formato", "BANDEJA"))
        por_bandeja = datos.get("huevos_por_bandeja", getattr(self.instance, "huevos_por_bandeja", 30))
        if por_bandeja not in (20, 30):
            raise serializers.ValidationError({"huevos_por_bandeja": "Las bandejas son de 20 o de 30 huevos."})
        if equivalencia is None:
            return datos
        huevos = round(equivalencia * 30)
        if formato == "UNIDAD" and (huevos != 1 or por_bandeja != 30):
            raise serializers.ValidationError({"cantidad_bandejas_equivalentes": "La unidad es un solo huevo."})
        if formato == "BANDEJA" and huevos != por_bandeja:
            raise serializers.ValidationError({"cantidad_bandejas_equivalentes": f"Una bandeja de {por_bandeja} huevos trae {por_bandeja} huevos."})
        if formato == "CAJA" and (huevos % por_bandeja or huevos < 2 * por_bandeja):
            raise serializers.ValidationError({"cantidad_bandejas_equivalentes": "Una caja trae 2 bandejas enteras o más."})
        return datos


class PrecioSerializer(serializers.ModelSerializer):
    """Precio de venta de un producto en una presentación (vigente si no tiene fecha_hasta)."""

    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    presentacion_nombre = serializers.CharField(source="presentacion.nombre", read_only=True)
    bandejas = serializers.DecimalField(
        source="presentacion.cantidad_bandejas_equivalentes", max_digits=12, decimal_places=6, read_only=True)
    stock_bandejas = serializers.SerializerMethodField()  # para avisar en la venta si no alcanza
    formato = serializers.CharField(source="presentacion.formato", read_only=True)
    huevos_por_bandeja = serializers.IntegerField(source="presentacion.huevos_por_bandeja", read_only=True)

    class Meta:
        model = PrecioProducto
        fields = ["id_precio", "producto", "producto_nombre", "presentacion", "presentacion_nombre",
                  "bandejas", "formato", "huevos_por_bandeja", "precio", "fecha_desde", "fecha_hasta", "stock_bandejas"]

    def get_stock_bandejas(self, precio):
        stock = getattr(precio.producto, "stock", None)
        return str(stock.cantidad_bandejas) if stock else "0"


class ConfirmarPrecioSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.filter(estado="ACTIVO"))
    presentacion = serializers.PrimaryKeyRelatedField(queryset=Presentacion.objects.filter(estado="ACTIVO"))
    precio = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    # Si el precio no cubre el equilibrio, la pantalla pide confirmarlo otra vez (HU-02-C).
    confirmar_bajo_equilibrio = serializers.BooleanField(default=False)

    def validate(self, datos):
        if not presentacion_permitida(datos["producto"], datos["presentacion"]):
            raise serializers.ValidationError({"presentacion": SOLO_SUPER})
        return datos
