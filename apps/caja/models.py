from django.conf import settings
from django.db import models
from django.utils import timezone


class Caja(models.Model):
    class Estado(models.TextChoices):
        ABIERTA = "ABIERTA", "Abierta"
        CERRADA = "CERRADA", "Cerrada"

    id_caja = models.AutoField(primary_key=True)
    fecha_hora_apertura = models.DateTimeField(default=timezone.now)
    saldo_inicial = models.DecimalField(max_digits=12, decimal_places=2)
    usuario_apertura = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        db_column="id_usuario_apertura",
        related_name="cajas_abiertas",
    )
    fecha_hora_cierre = models.DateTimeField(null=True, blank=True)
    efectivo_contado = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    saldo_esperado = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    diferencia = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    usuario_cierre = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        db_column="id_usuario_cierre",
        related_name="cajas_cerradas",
        null=True,
        blank=True,
    )
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ABIERTA
    )

    class Meta:
        db_table = "caja"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(estado__in=["ABIERTA", "CERRADA"]),
                name="caja_estado_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(saldo_inicial__gte=0),
                name="caja_saldo_inicial_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(efectivo_contado__isnull=True)
                | models.Q(efectivo_contado__gte=0),
                name="caja_contado_no_negativo",
            ),
            models.UniqueConstraint(
                fields=["estado"],
                condition=models.Q(estado="ABIERTA"),
                name="caja_una_sola_abierta",
            ),
            models.CheckConstraint(
                condition=models.Q(estado="ABIERTA")
                | (
                    models.Q(fecha_hora_cierre__isnull=False)
                    & models.Q(efectivo_contado__isnull=False)
                    & models.Q(saldo_esperado__isnull=False)
                    & models.Q(diferencia__isnull=False)
                    & models.Q(usuario_cierre__isnull=False)
                ),
                name="caja_cerrada_con_datos_de_cierre",
            ),
        ]

    def __str__(self):
        return f"Caja {self.pk} ({self.estado})"


class MovimientoCaja(models.Model):
    class Tipo(models.TextChoices):
        VENTA_EFECTIVO = "VENTA_EFECTIVO", "Venta en efectivo"
        COBRO_DEUDA_EFECTIVO = "COBRO_DEUDA_EFECTIVO", "Cobro de deuda en efectivo"
        GASTO_EFECTIVO = "GASTO_EFECTIVO", "Gasto en efectivo"
        INGRESO_MANUAL = "INGRESO_MANUAL", "Ingreso manual"
        RETIRO = "RETIRO", "Retiro"

    id_movimiento_caja = models.AutoField(primary_key=True)
    caja = models.ForeignKey(
        Caja, on_delete=models.PROTECT, db_column="id_caja", related_name="movimientos"
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )
    fecha_hora = models.DateTimeField(default=timezone.now)
    tipo_movimiento = models.CharField(max_length=30, choices=Tipo.choices)
    importe = models.DecimalField(max_digits=12, decimal_places=2)
    motivo = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        db_table = "movimiento_caja"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(tipo_movimiento__in=[
                    "VENTA_EFECTIVO", "COBRO_DEUDA_EFECTIVO", "GASTO_EFECTIVO",
                    "INGRESO_MANUAL", "RETIRO",
                ]),
                name="movcaja_tipo_valido",
            ),
            models.CheckConstraint(
                condition=models.Q(importe__gt=0), name="movcaja_importe_positivo"
            ),
            models.CheckConstraint(
                condition=~models.Q(tipo_movimiento__in=["INGRESO_MANUAL", "RETIRO"])
                | (models.Q(motivo__isnull=False) & ~models.Q(motivo="")),
                name="movcaja_motivo_manual_retiro",
            ),
        ]

    def __str__(self):
        return f"{self.tipo_movimiento} {self.importe}"