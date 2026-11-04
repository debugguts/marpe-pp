from django.db import models

from config.comunes import Estado


class TipoHuevo(models.TextChoices):
    BLANCO = "BLANCO", "Blanco"
    CASTANO = "CASTAÑO", "Castaño"


class Tamano(models.TextChoices):
    MEDIANO = "MEDIANO", "Mediano"
    SELECCION = "SELECCIÓN", "Selección"
    SUPER = "SÚPER", "Súper"


class Producto(models.Model):
    id_producto = models.AutoField(primary_key=True)
    tipo_huevo = models.CharField(max_length=20, choices=TipoHuevo.choices)
    tamano = models.CharField(max_length=20, choices=Tamano.choices)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        db_table = "producto"
        constraints = [
            models.UniqueConstraint(
                fields=["tipo_huevo", "tamano"], name="producto_tipo_tamano_unico"
            ),
            models.CheckConstraint(
                condition=models.Q(tipo_huevo__in=TipoHuevo.values),
                name="producto_tipo_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(tamano__in=Tamano.values),
                name="producto_tamano_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(estado__in=Estado.values),
                name="producto_estado_valido",
            ),
        ]

    def __str__(self):
        return f"{self.get_tipo_huevo_display()} {self.get_tamano_display()}"


class Presentacion(models.Model):
    id_presentacion = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=50, unique=True)
    cantidad_bandejas_equivalentes = models.DecimalField(
        max_digits=12, decimal_places=6
    )
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        db_table = "presentacion"
        verbose_name_plural = "presentaciones"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad_bandejas_equivalentes__gt=0),
                name="presentacion_equivalencia_positiva",
            ),
            models.CheckConstraint(
                condition=models.Q(estado__in=Estado.values),
                name="presentacion_estado_valido",
            ),
        ]

    def __str__(self):
        return self.nombre


class PrecioProducto(models.Model):
    id_precio = models.AutoField(primary_key=True)
    producto = models.ForeignKey(
        Producto, on_delete=models.PROTECT, db_column="id_producto"
    )
    presentacion = models.ForeignKey(
        Presentacion, on_delete=models.PROTECT, db_column="id_presentacion"
    )
    precio = models.DecimalField(max_digits=12, decimal_places=2)
    fecha_desde = models.DateField()
    fecha_hasta = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "precio_producto"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(precio__gte=0), name="precio_no_negativo"
            ),
            models.CheckConstraint(
                condition=models.Q(fecha_hasta__isnull=True)
                | models.Q(fecha_hasta__gte=models.F("fecha_desde")),
                name="precio_fechas_coherentes",
            ),
            models.UniqueConstraint(
                fields=["producto", "presentacion"],
                condition=models.Q(fecha_hasta__isnull=True),
                name="precio_un_solo_vigente",
            ),
        ]

    def __str__(self):
        return f"{self.producto} / {self.presentacion}: {self.precio}"