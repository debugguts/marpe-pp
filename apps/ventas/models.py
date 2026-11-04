from django.conf import settings
from django.db import models
from django.utils import timezone
from apps.caja.models import MovimientoCaja
from apps.inventario.models import MovimientoInventario
from apps.catalogo.models import Presentacion, Producto
from apps.clientes.models import CONSUMIDOR_FINAL_ID, Cliente
from config.comunes import MedioPago


class Venta(models.Model):
    class Modalidad(models.TextChoices):
        CONTADO = "CONTADO", "Contado"
        FIADO = "FIADO", "Fiado"

    id_venta = models.AutoField(primary_key=True)
    fecha = models.DateTimeField(default=timezone.now)
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.PROTECT,
        db_column="id_cliente",
        default=CONSUMIDOR_FINAL_ID,
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, db_column="id_usuario"
    )

    class Meta:
        db_table = "venta"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(modalidad__in=["CONTADO", "FIADO"]),
                name="venta_modalidad_valida",
            ),
            models.CheckConstraint(
                condition=models.Q(total__gte=0), name="venta_total_no_negativo"
            ),
            models.CheckConstraint(
                condition=~(
                    models.Q(modalidad="FIADO")
                    & models.Q(cliente=CONSUMIDOR_FINAL_ID)
                ),
                name="venta_fiado_requiere_cliente_real",
            ),
        ]

    def __str__(self):
        return f"Venta {self.pk} - {self.modalidad}"


class DetalleVenta(models.Model):
    id_detalle_venta = models.AutoField(primary_key=True)
    venta = models.ForeignKey(
        Venta, on_delete=models.CASCADE, db_column="id_venta", related_name="detalles"
    )
    producto = models.ForeignKey(
        Producto, on_delete=models.PROTECT, db_column="id_producto"
    )
    presentacion = models.ForeignKey(
        Presentacion, on_delete=models.PROTECT, db_column="id_presentacion"
    )
    cantidad = models.DecimalField(max_digits=12, decimal_places=3)
    precio_unitario_aplicado = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "detalle_venta"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0), name="detventa_cantidad_positiva"
            ),
            models.CheckConstraint(
                condition=models.Q(precio_unitario_aplicado__gte=0),
                name="detventa_precio_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0),
                name="detventa_subtotal_no_negativo",
            ),
        ]

    def __str__(self):
        return f"Detalle {self.pk} de venta {self.venta_id}"


class PagoVenta(models.Model):
    id_pago_venta = models.AutoField(primary_key=True)
    venta = models.ForeignKey(
        Venta, on_delete=models.PROTECT, db_column="id_venta", related_name="pagos"
    )
    fecha_hora = models.DateTimeField(default=timezone.now)
    medio_pago = models.CharField(max_length=20, choices=MedioPago.choices)
    importe = models.DecimalField(max_digits=12, decimal_places=2)
    referencia_transferencia = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = "pago_venta"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(importe__gt=0), name="pagoventa_importe_positivo"
            ),
            models.CheckConstraint(
                condition=models.Q(medio_pago__in=MedioPago.values),
                name="pagoventa_medio_valido",
            ),
            models.CheckConstraint(
                condition=~models.Q(medio_pago="TRANSFERENCIA")
                | (
                    models.Q(referencia_transferencia__isnull=False)
                    & ~models.Q(referencia_transferencia="")
                ),
                name="pagoventa_transferencia_con_referencia",
            ),
        ]

    def __str__(self):
        return f"Pago {self.pk}: {self.medio_pago} {self.importe}"



class CuentaCorriente(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        CANCELADA = "CANCELADA", "Cancelada"

    id_cuenta = models.AutoField(primary_key=True)
    venta = models.OneToOneField(
        Venta,
        on_delete=models.PROTECT,
        db_column="id_venta",
        related_name="cuenta_corriente",
    )
    importe_original = models.DecimalField(max_digits=12, decimal_places=2)
    saldo_pendiente = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.PENDIENTE
    )

    class Meta:
        db_table = "cuenta_corriente"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(importe_original__gt=0),
                name="cuenta_importe_positivo",
            ),
            models.CheckConstraint(
                condition=models.Q(saldo_pendiente__gte=0),
                name="cuenta_saldo_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(saldo_pendiente__lte=models.F("importe_original")),
                name="cuenta_saldo_no_supera_original",
            ),
            models.CheckConstraint(
                condition=models.Q(estado__in=["PENDIENTE", "CANCELADA"]),
                name="cuenta_estado_valido",
            ),
            models.CheckConstraint(
                condition=~models.Q(estado="CANCELADA")
                | models.Q(saldo_pendiente=0),
                name="cuenta_cancelada_saldo_cero",
            ),
        ]

    def __str__(self):
        return f"Cuenta {self.pk} (saldo {self.saldo_pendiente})"


class PagoCuenta(models.Model):
    id_pago_cuenta = models.AutoField(primary_key=True)
    cuenta = models.ForeignKey(
        CuentaCorriente,
        on_delete=models.PROTECT,
        db_column="id_cuenta",
        related_name="pagos",
    )
    fecha_hora = models.DateTimeField(default=timezone.now)
    importe = models.DecimalField(max_digits=12, decimal_places=2)
    medio_pago = models.CharField(max_length=20, choices=MedioPago.choices)
    referencia_transferencia = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = "pago_cuenta"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(importe__gt=0), name="pagocuenta_importe_positivo"
            ),
            models.CheckConstraint(
                condition=models.Q(medio_pago__in=MedioPago.values),
                name="pagocuenta_medio_valido",
            ),
            models.CheckConstraint(
                condition=~models.Q(medio_pago="TRANSFERENCIA")
                | (
                    models.Q(referencia_transferencia__isnull=False)
                    & ~models.Q(referencia_transferencia="")
                ),
                name="pagocuenta_transferencia_con_referencia",
            ),
        ]

    def __str__(self):
        return f"Cobro {self.pk}: {self.importe}"


class DetalleVentaMovimiento(models.Model):
    detalle_venta = models.OneToOneField(
        DetalleVenta,
        on_delete=models.PROTECT,
        primary_key=True,
        db_column="id_detalle_venta",
    )
    movimiento_inventario = models.OneToOneField(
        MovimientoInventario,
        on_delete=models.PROTECT,
        db_column="id_movimiento_inventario",
    )

    class Meta:
        db_table = "detalle_venta_movimiento"


class PagoVentaMovCaja(models.Model):
    pago_venta = models.OneToOneField(
        PagoVenta,
        on_delete=models.PROTECT,
        primary_key=True,
        db_column="id_pago_venta",
    )
    movimiento_caja = models.OneToOneField(
        MovimientoCaja, on_delete=models.PROTECT, db_column="id_movimiento_caja"
    )

    class Meta:
        db_table = "pago_venta_mov_caja"


class PagoCuentaMovCaja(models.Model):
    pago_cuenta = models.OneToOneField(
        PagoCuenta,
        on_delete=models.PROTECT,
        primary_key=True,
        db_column="id_pago_cuenta",
    )
    movimiento_caja = models.OneToOneField(
        MovimientoCaja, on_delete=models.PROTECT, db_column="id_movimiento_caja"
    )

    class Meta:
        db_table = "pago_cuenta_mov_caja"