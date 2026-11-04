from django.db import models

from config.comunes import Estado

CONSUMIDOR_FINAL_ID = 1


class Cliente(models.Model):
    id_cliente = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        db_table = "cliente"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(estado__in=Estado.values),
                name="cliente_estado_valido",
            )
        ]

    def __str__(self):
        return self.nombre

    def delete(self, *args, **kwargs):
        if self.pk == CONSUMIDOR_FINAL_ID:
            raise models.ProtectedError(
                "El cliente 'Consumidor final' no se puede eliminar.", [self]
            )
        return super().delete(*args, **kwargs)