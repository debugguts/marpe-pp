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