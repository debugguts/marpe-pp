from django.conf import settings
from django.db import models

from apps.catalogo.models import Presentacion, Producto
from apps.inventario.models import MovimientoInventario
from apps.proveedores.models import Proveedor


class Compra(models.Model):
    id_compra = models.AutoField(primary_key=True)
    fecha = models.DateField()
    total = models.DecimalField(max_digits=12, decimal_places=2)
    proveedor = models.ForeignKey(
        Proveedor, on_delete=models.PROTECT, db_column="id_proveedor"
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )

    class Meta:
        db_table = "compra"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total__gte=0), name="compra_total_no_negativo"
            )
        ]

    def __str__(self):
        return f"Compra {self.pk} - {self.fecha}"


class DetalleCompra(models.Model):
    id_detalle_compra = models.AutoField(primary_key=True)
    compra = models.ForeignKey(
        Compra, on_delete=models.CASCADE, db_column="id_compra", related_name="detalles"
    )
    producto = models.ForeignKey(
        Producto, on_delete=models.PROTECT, db_column="id_producto"
    )
    presentacion = models.ForeignKey(
        Presentacion, on_delete=models.PROTECT, db_column="id_presentacion"
    )
    cantidad = models.DecimalField(max_digits=12, decimal_places=3)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "detalle_compra"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0), name="detcompra_cantidad_positiva"
            ),
            models.CheckConstraint(
                condition=models.Q(precio_unitario__gte=0),
                name="detcompra_precio_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0),
                name="detcompra_subtotal_no_negativo",
            ),
        ]

    def __str__(self):
        return f"Detalle {self.pk} de compra {self.compra_id}"


class DetalleCompraMovimiento(models.Model):
    detalle_compra = models.OneToOneField(
        DetalleCompra,
        on_delete=models.PROTECT,
        primary_key=True,
        db_column="id_detalle_compra",
    )
    movimiento_inventario = models.OneToOneField(
        MovimientoInventario,
        on_delete=models.PROTECT,
        db_column="id_movimiento_inventario",
    )

    class Meta:
        db_table = "detalle_compra_movimiento"