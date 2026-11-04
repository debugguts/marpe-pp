from django.conf import settings
from django.db import models

from apps.caja.models import MovimientoCaja
from config.comunes import MedioPago


class Gasto(models.Model):
    id_gasto = models.AutoField(primary_key=True)
    fecha = models.DateField()
    concepto = models.CharField(max_length=200)
    categoria = models.CharField(max_length=80)
    importe = models.DecimalField(max_digits=12, decimal_places=2)
    medio_pago = models.CharField(max_length=20, choices=MedioPago.choices)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )

    class Meta:
        db_table = "gasto"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(importe__gt=0), name="gasto_importe_positivo"
            ),
            models.CheckConstraint(
                condition=models.Q(medio_pago__in=MedioPago.values),
                name="gasto_medio_pago_valido",
            ),
        ]

    def __str__(self):
        return f"{self.concepto} ({self.importe})"


class GastoMovCaja(models.Model):
    gasto = models.OneToOneField(
        Gasto, on_delete=models.PROTECT, primary_key=True, db_column="id_gasto"
    )
    movimiento_caja = models.OneToOneField(
        MovimientoCaja, on_delete=models.PROTECT, db_column="id_movimiento_caja"
    )

    class Meta:
        db_table = "gasto_mov_caja"