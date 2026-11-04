from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.catalogo.models import Producto


class Stock(models.Model):
    producto = models.OneToOneField(
        Producto,
        on_delete=models.PROTECT,
        primary_key=True,
        db_column="id_producto",
    )
    cantidad_bandejas = models.DecimalField(max_digits=12, decimal_places=6)
    stock_minimo_bandejas = models.DecimalField(max_digits=12, decimal_places=6)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad_bandejas__gte=0),
                name="stock_cantidad_no_negativa",
            ),
            models.CheckConstraint(
                condition=models.Q(stock_minimo_bandejas__gte=0),
                name="stock_minimo_no_negativo",
            ),
        ]

    def __str__(self):
        return f"{self.producto}: {self.cantidad_bandejas}"


class MovimientoInventario(models.Model):
    class Tipo(models.TextChoices):
        INGRESO_COMPRA = "INGRESO_COMPRA", "Ingreso por compra"
        EGRESO_VENTA = "EGRESO_VENTA", "Egreso por venta"
        MERMA = "MERMA", "Merma"
        AJUSTE_POSITIVO = "AJUSTE_POSITIVO", "Ajuste positivo"
        AJUSTE_NEGATIVO = "AJUSTE_NEGATIVO", "Ajuste negativo"

    id_movimiento_inventario = models.AutoField(primary_key=True)
    producto = models.ForeignKey(
        Producto, on_delete=models.PROTECT, db_column="id_producto"
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )
    tipo_movimiento = models.CharField(max_length=30, choices=Tipo.choices)
    cantidad_bandejas = models.DecimalField(max_digits=12, decimal_places=6)
    fecha_hora = models.DateTimeField(default=timezone.now)
    motivo = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        db_table = "movimiento_inventario"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(tipo_movimiento__in=[
                    "INGRESO_COMPRA", "EGRESO_VENTA", "MERMA",
                    "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO",
                ]),
                name="movinv_tipo_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(cantidad_bandejas__gt=0),
                name="movinv_cantidad_positiva",
            ),
            models.CheckConstraint(
                condition=models.Q(tipo_movimiento__in=["INGRESO_COMPRA", "EGRESO_VENTA"])
                | (models.Q(motivo__isnull=False) & ~models.Q(motivo="")),
                name="movinv_motivo_merma_ajuste",
            ),
        ]

    def __str__(self):
        return f"{self.tipo_movimiento} {self.cantidad_bandejas} ({self.producto})"