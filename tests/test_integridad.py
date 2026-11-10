from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from apps.caja.models import Caja, MovimientoCaja
from apps.catalogo.models import PrecioProducto, Presentacion, Producto
from apps.clientes.models import CONSUMIDOR_FINAL_ID, Cliente
from apps.compras.models import Compra, DetalleCompra, DetalleCompraMovimiento
from apps.inventario.models import MovimientoInventario, Stock
from apps.proveedores.models import Proveedor
from apps.usuarios.models import Usuario
from apps.ventas.models import CuentaCorriente, PagoVenta, Venta


class IntegridadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = Usuario.objects.create_user("tester", password="x")
        cls.prod = Producto.objects.create(tipo_huevo="BLANCO", tamano="MEDIANO")
        cls.pres = Presentacion.objects.create(
            nombre="Bandeja", cantidad_bandejas_equivalentes=Decimal("1")
        )
        cls.cliente = Cliente.objects.create(nombre="Cliente Test")

    def assertBloquea(self, modelo, **campos):
        with self.assertRaises(IntegrityError), transaction.atomic():
            modelo.objects.create(**campos)

    def venta(self, modalidad="FIADO"):
        return Venta.objects.create(
            modalidad=modalidad, total=Decimal("100"), cliente=self.cliente, usuario=self.user
        )

    def movimiento(self, tipo="INGRESO_COMPRA", cantidad="1", motivo=None):
        return MovimientoInventario.objects.create(
            producto=self.prod, usuario=self.user, tipo_movimiento=tipo,
            cantidad_bandejas=Decimal(cantidad), motivo=motivo,
        )

    # --- Cliente fijo ---
    def test_consumidor_final_existe(self):
        self.assertEqual(Cliente.objects.get(pk=CONSUMIDOR_FINAL_ID).nombre, "Consumidor final")

    def test_consumidor_final_no_se_borra(self):
        with self.assertRaises(ProtectedError):
            Cliente.objects.get(pk=CONSUMIDOR_FINAL_ID).delete()

    def test_venta_usa_consumidor_final_por_defecto(self):
        v = Venta.objects.create(modalidad="CONTADO", total=Decimal("0"), usuario=self.user)
        self.assertEqual(v.cliente_id, CONSUMIDOR_FINAL_ID)

    def test_fiado_con_consumidor_final_rechazado(self):
        self.assertBloquea(
            Venta, modalidad="FIADO", total=Decimal("10"),
            cliente_id=CONSUMIDOR_FINAL_ID, usuario=self.user,
        )

    def test_fiado_con_cliente_real_ok(self):
        self.assertEqual(self.venta("FIADO").modalidad, "FIADO")

    # --- Catálogo ---
    def test_estado_invalido_rechazado(self):
        self.assertBloquea(Proveedor, nombre="X", estado="OTRO")

    def test_equivalencia_no_positiva_rechazada(self):
        self.assertBloquea(
            Presentacion, nombre="Cero", cantidad_bandejas_equivalentes=Decimal("0")
        )

    def test_equivalencia_decimal_exacta(self):
        p = Presentacion.objects.create(
            nombre="Unidad", cantidad_bandejas_equivalentes=Decimal("0.033333")
        )
        p.refresh_from_db()
        self.assertEqual(p.cantidad_bandejas_equivalentes, Decimal("0.033333"))

    def test_un_solo_precio_vigente(self):
        datos = dict(producto=self.prod, presentacion=self.pres,
                     precio=Decimal("100"), fecha_desde=date(2026, 10, 1))
        PrecioProducto.objects.create(**datos)
        self.assertBloquea(PrecioProducto, **datos)

    def test_precio_historico_convive_con_vigente(self):
        base = dict(producto=self.prod, presentacion=self.pres, precio=Decimal("100"))
        PrecioProducto.objects.create(fecha_desde=date(2026, 10, 1), **base)
        PrecioProducto.objects.create(
            fecha_desde=date(2026, 9, 1), fecha_hasta=date(2026, 9, 30), **base
        )
        self.assertEqual(PrecioProducto.objects.count(), 2)

    def test_precio_fechas_incoherentes_rechazadas(self):
        self.assertBloquea(
            PrecioProducto, producto=self.prod, presentacion=self.pres,
            precio=Decimal("100"), fecha_desde=date(2026, 10, 10),
            fecha_hasta=date(2026, 10, 1),
        )

    # --- Inventario ---
    def test_stock_negativo_rechazado(self):
        self.assertBloquea(
            Stock, producto=self.prod, cantidad_bandejas=Decimal("-1"),
            stock_minimo_bandejas=Decimal("0"),
        )

    def test_merma_sin_motivo_rechazada(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.movimiento("MERMA")

    def test_merma_con_motivo_ok(self):
        self.assertIsNotNone(self.movimiento("MERMA", motivo="Rotura").pk)

    def test_ingreso_compra_sin_motivo_ok(self):
        self.assertIsNotNone(self.movimiento("INGRESO_COMPRA").pk)

    def test_cantidad_movimiento_cero_rechazada(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.movimiento(cantidad="0")

    # --- Caja ---
    def test_dos_cajas_abiertas_rechazadas(self):
        Caja.objects.create(saldo_inicial=Decimal("0"), usuario_apertura=self.user)
        self.assertBloquea(Caja, saldo_inicial=Decimal("0"), usuario_apertura=self.user)

    def test_caja_cerrada_sin_datos_de_cierre_rechazada(self):
        self.assertBloquea(
            Caja, saldo_inicial=Decimal("0"), usuario_apertura=self.user, estado="CERRADA"
        )

    def test_retiro_sin_motivo_rechazado(self):
        caja = Caja.objects.create(saldo_inicial=Decimal("0"), usuario_apertura=self.user)
        self.assertBloquea(
            MovimientoCaja, caja=caja, usuario=self.user,
            tipo_movimiento="RETIRO", importe=Decimal("100"),
        )

    # --- Pagos y cuenta corriente ---
    def test_transferencia_sin_referencia_rechazada(self):
        self.assertBloquea(
            PagoVenta, venta=self.venta("CONTADO"), medio_pago="TRANSFERENCIA",
            importe=Decimal("100"),
        )

    def test_transferencia_con_referencia_ok(self):
        pago = PagoVenta.objects.create(
            venta=self.venta("CONTADO"), medio_pago="TRANSFERENCIA",
            importe=Decimal("100"), referencia_transferencia="TRF-1",
        )
        self.assertIsNotNone(pago.pk)

    def test_cuenta_saldo_mayor_al_original_rechazado(self):
        self.assertBloquea(
            CuentaCorriente, venta=self.venta(), importe_original=Decimal("100"),
            saldo_pendiente=Decimal("150"),
        )

    def test_una_cuenta_por_venta(self):
        v = self.venta()
        datos = dict(venta=v, importe_original=Decimal("100"), saldo_pendiente=Decimal("100"))
        CuentaCorriente.objects.create(**datos)
        self.assertBloquea(CuentaCorriente, **datos)

    # --- Tablas puente ---
    def test_movimiento_no_se_asocia_a_dos_detalles(self):
        prov = Proveedor.objects.create(nombre="Prov Test")
        compra = Compra.objects.create(
            fecha=date(2026, 11, 3), total=Decimal("20"), proveedor=prov, usuario=self.user
        )
        datos = dict(compra=compra, producto=self.prod, presentacion=self.pres,
                     cantidad=Decimal("1"), precio_unitario=Decimal("10"),
                     subtotal=Decimal("10"))
        d1 = DetalleCompra.objects.create(**datos)
        d2 = DetalleCompra.objects.create(**datos)
        mov = self.movimiento()
        DetalleCompraMovimiento.objects.create(detalle_compra=d1, movimiento_inventario=mov)
        self.assertBloquea(
            DetalleCompraMovimiento, detalle_compra=d2, movimiento_inventario=mov
        )