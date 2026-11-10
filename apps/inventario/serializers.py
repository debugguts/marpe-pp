from decimal import ROUND_DOWN, Decimal

from rest_framework import serializers

from apps.catalogo.models import Presentacion, Producto
from config.comunes import Estado

from .models import MovimientoInventario, Stock

ACTIVO = {"does_not_exist": "No existe o está dado de baja."}


def por_presentacion(bandejas):
    """20 bandejas → [3 Caja, 2 Bandeja, 0 Unidad], con 1 caja = 6 bandejas (HU-06-B).

    Se reparte de la presentación más grande a la más chica, como se arma un pedido.
    """
    resto = bandejas
    reparto = []
    for p in Presentacion.objects.filter(estado=Estado.ACTIVO).order_by("-cantidad_bandejas_equivalentes"):
        cantidad = (resto / p.cantidad_bandejas_equivalentes).to_integral_value(rounding=ROUND_DOWN)
        resto -= cantidad * p.cantidad_bandejas_equivalentes
        reparto.append({"presentacion": p.nombre, "cantidad": int(cantidad)})
    return reparto


class StockSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    bajo_minimo = serializers.SerializerMethodField()
    por_presentacion = serializers.SerializerMethodField()

    class Meta:
        model = Stock
        fields = ["producto", "producto_nombre", "cantidad_bandejas", "stock_minimo_bandejas",
                  "bajo_minimo", "por_presentacion", "fecha_actualizacion"]
        # El stock solo cambia con movimientos; acá se puede editar el mínimo.
        read_only_fields = ["producto", "cantidad_bandejas", "fecha_actualizacion"]

    def validate_stock_minimo_bandejas(self, valor):
        if valor < 0:
            raise serializers.ValidationError("El mínimo no puede ser negativo.")
        return valor

    def get_bajo_minimo(self, stock):
        return stock.cantidad_bandejas < stock.stock_minimo_bandejas

    def get_por_presentacion(self, stock):
        return por_presentacion(stock.cantidad_bandejas)


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source="producto.__str__", read_only=True)
    tipo_texto = serializers.CharField(source="get_tipo_movimiento_display", read_only=True)
    usuario_nombre = serializers.CharField(source="usuario.username", read_only=True)

    class Meta:
        model = MovimientoInventario
        fields = ["id_movimiento_inventario", "fecha_hora", "producto", "producto_nombre", "tipo_movimiento",
                  "tipo_texto", "cantidad_bandejas", "motivo", "usuario_nombre"]


class MermaOAjusteSerializer(serializers.Serializer):
    """Merma (rotura, pérdida) o ajuste por conteo físico: siempre con motivo (HU-06-D, HU-08-A)."""

    tipo_movimiento = serializers.ChoiceField(choices=[
        (MovimientoInventario.Tipo.MERMA, "Merma"),
        (MovimientoInventario.Tipo.AJUSTE_POSITIVO, "Ajuste positivo"),
        (MovimientoInventario.Tipo.AJUSTE_NEGATIVO, "Ajuste negativo"),
    ])
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    presentacion = serializers.PrimaryKeyRelatedField(
        queryset=Presentacion.objects.filter(estado=Estado.ACTIVO), error_messages=ACTIVO)
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    motivo = serializers.CharField(max_length=200)
