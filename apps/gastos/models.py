from django.conf import settings
from django.db import models

from apps.caja.models import MovimientoCaja
from config.comunes import MedioPago


class Gasto(models.Model):
    class Tipo(models.TextChoices):
        # Los fijos (puesto de feria, sueldos, ...) se usan para calcular el precio sugerido (HU-09-E).
        FIJO = "FIJO", "Fijo"
        VARIABLE = "VARIABLE", "Variable"

    class Estado(models.TextChoices):
        # Un gasto no se borra: si estuvo mal, se anula con motivo y queda el registro.
        CONFIRMADO = "CONFIRMADO", "Confirmado"
        ANULADO = "ANULADO", "Anulado"

    id_gasto = models.AutoField(primary_key=True)
    fecha = models.DateField()
    concepto = models.CharField(max_length=200)
    categoria = models.CharField(max_length=80)
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.VARIABLE)
    importe = models.DecimalField(max_digits=12, decimal_places=2)
    medio_pago = models.CharField(max_length=20, choices=MedioPago.choices)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.CONFIRMADO)
    fecha_modificacion = models.DateTimeField(null=True, blank=True)
    fecha_anulacion = models.DateTimeField(null=True, blank=True)
    motivo_anulacion = models.CharField(max_length=200, null=True, blank=True)

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
            models.CheckConstraint(
                condition=models.Q(tipo__in=["FIJO", "VARIABLE"]),
                name="gasto_tipo_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(estado__in=["CONFIRMADO", "ANULADO"]),
                name="gasto_estado_valido",
            ),
            models.CheckConstraint(
                condition=~models.Q(estado="ANULADO")
                | (models.Q(motivo_anulacion__isnull=False) & ~models.Q(motivo_anulacion="")),
                name="gasto_anulado_con_motivo",
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