"""Casos incorrectos de los movimientos (S5-14): lo que el sistema NO tiene que dejar pasar."""

from rest_framework.test import APITestCase

from apps.caja.models import Caja
from apps.clientes.models import Cliente
from apps.inventario.models import MovimientoInventario
from apps.ventas.models import Venta

from .datos import crear_base, stock_de


class CasosIncorrectosTest(APITestCase):
    def setUp(self):
        crear_base(self)

    def vender(self, **datos):
        cuerpo = {"modalidad": "CONTADO", "medio_pago": "EFECTIVO",
                  "detalles": [{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}]}
        cuerpo.update(datos)
        return self.client.post("/api/ventas/", cuerpo, format="json")

    def test_venta_sin_productos(self):
        self.assertIn("detalles", self.vender(detalles=[]).data)

    def test_venta_con_producto_repetido(self):
        linea = {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}
        self.assertIn("repetido", str(self.vender(detalles=[linea, linea]).data))

    def test_cantidad_cero_o_negativa(self):
        for cantidad in ["0", "-2", "abc"]:
            respuesta = self.vender(detalles=[{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": cantidad}])
            self.assertEqual(respuesta.status_code, 400, cantidad)

    def test_stock_insuficiente_no_vende_nada(self):
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        respuesta = self.vender(detalles=[{"producto": self.producto.pk, "presentacion": self.caja.pk, "cantidad": "4"}])
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("Stock insuficiente", str(respuesta.data))
        self.assertIn("hay 20 bandejas", str(respuesta.data))
        self.assertEqual(stock_de(self.producto), 20)
        self.assertFalse(Venta.objects.exists())
        self.assertFalse(MovimientoInventario.objects.exists())

    def test_fiado_a_consumidor_final(self):
        respuesta = self.vender(modalidad="FIADO", cliente=1)
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("cliente", respuesta.data)

    def test_fiado_sin_cliente(self):
        self.assertIn("cliente", self.vender(modalidad="FIADO").data)

    def test_cliente_dado_de_baja(self):
        baja = Cliente.objects.create(nombre="Cliente viejo", estado="INACTIVO")
        self.assertIn("cliente", self.vender(cliente=baja.pk).data)

    def test_efectivo_sin_caja_abierta_no_vende_nada(self):
        respuesta = self.vender()
        self.assertIn("No hay una caja abierta", str(respuesta.data))
        self.assertEqual(stock_de(self.producto), 20)  # se deshizo el descuento de stock

    def test_contado_sin_medio_de_pago(self):
        self.assertIn("medio_pago", self.vender(medio_pago=None).data)

    def test_compra_con_proveedor_inexistente(self):
        respuesta = self.client.post("/api/compras/", {"proveedor": 999, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}]}, format="json")
        self.assertIn("proveedor", respuesta.data)

    def test_retiro_mayor_al_efectivo_de_la_caja(self):
        caja = Caja.objects.create(saldo_inicial=1000, usuario_apertura=self.operador)
        respuesta = self.client.post(f"/api/cajas/{caja.pk}/movimientos/",
                                     {"tipo_movimiento": "RETIRO", "importe": "5000", "motivo": "x"}, format="json")
        self.assertIn("No alcanza el efectivo", str(respuesta.data))
