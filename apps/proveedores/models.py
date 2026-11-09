from datetime import date

from django.db import models

from config.comunes import Estado


class Proveedor(models.Model):
    id_proveedor = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    direccion = models.CharField(max_length=200, null=True, blank=True)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        db_table = "proveedor"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(estado__in=Estado.values),
                name="proveedor_estado_valido",
            )
        ]

    def __str__(self):
        return self.nombre

class CostoProveedor(models.Model):
    """Precio de costo que cotiza un proveedor por producto y presentación (HU-03-D).

    Guarda el historial: el costo vigente es el que tiene fecha_hasta vacía.
    """

    id_costo = models.AutoField(primary_key=True)
    proveedor = models.ForeignKey(
        Proveedor, on_delete=models.PROTECT, db_column="id_proveedor", related_name="costos"
    )
    producto = models.ForeignKey(
        "catalogo.Producto", on_delete=models.PROTECT, db_column="id_producto"
    )
    presentacion = models.ForeignKey(
        "catalogo.Presentacion", on_delete=models.PROTECT, db_column="id_presentacion"
    )
    precio_costo = models.DecimalField(max_digits=12, decimal_places=2)
    fecha_desde = models.DateField(default=date.today)
    fecha_hasta = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "costo_proveedor"
        verbose_name_plural = "costos de proveedores"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(precio_costo__gt=0), name="costo_precio_positivo"
            ),
            models.CheckConstraint(
                condition=models.Q(fecha_hasta__isnull=True)
                | models.Q(fecha_hasta__gte=models.F("fecha_desde")),
                name="costo_fechas_coherentes",
            ),
            models.UniqueConstraint(
                fields=["proveedor", "producto", "presentacion"],
                condition=models.Q(fecha_hasta__isnull=True),
                name="costo_un_solo_vigente",
            ),
        ]

    def __str__(self):
        return f"{self.proveedor} · {self.producto} / {self.presentacion}: {self.precio_costo}"
