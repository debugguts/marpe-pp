"""Pruebas de las ventas (S5-06, HU-05 y HU-06-E)."""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja, MovimientoCaja
from apps.catalogo.models import PrecioProducto
from apps.clientes.models import Cliente
from apps.ventas.models import CuentaCorriente, Venta

from .datos import crear_base, stock_de


class VentasAPITest(APITestCase):
    url = "/api/ventas/"

    def setUp(self):
        crear_base(self)
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        self.cliente = Cliente.objects.create(nombre="Almacén Don Pepe")

    def vender(self, cantidad="2", **datos):
        cuerpo = {"modalidad": "CONTADO", "medio_pago": "EFECTIVO",
                  "detalles": [{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": cantidad}]}
        cuerpo.update(datos)
        return self.client.post(self.url, cuerpo, format="json")

    def test_venta_contado_efectivo_descuenta_stock_y_entra_a_caja(self):
        respuesta = self.vender()
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["total"], "14000.00")
        self.assertEqual(stock_de(self.producto), 18)
        self.assertEqual(MovimientoCaja.objects.get().importe, Decimal("14000"))

    def test_transferencia_no_pasa_por_caja_y_pide_referencia(self):
        sin_ref = self.vender(medio_pago="TRANSFERENCIA")
        self.assertEqual(sin_ref.status_code, 400)
        self.assertIn("referencia_transferencia", sin_ref.data)
        con_ref = self.vender(medio_pago="TRANSFERENCIA", referencia_transferencia="TRF-1")
        self.assertEqual(con_ref.status_code, 201)
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_la_venta_conserva_el_precio_aunque_despues_cambie(self):
        id_venta = self.vender().data["id_venta"]
        PrecioProducto.objects.update(precio=Decimal("9999"))
        detalle = self.client.get(f"{self.url}{id_venta}/").data["detalles"][0]
        self.assertEqual(detalle["precio_unitario_aplicado"], "7000.00")

    def test_fiado_abre_la_deuda_en_la_cuenta_corriente(self):
        respuesta = self.vender(modalidad="FIADO", medio_pago=None, cliente=self.cliente.pk)
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["saldo_pendiente"], "14000.00")
        self.assertEqual(CuentaCorriente.objects.get().estado, "PENDIENTE")
        self.assertEqual(stock_de(self.producto), 18)

    def test_una_venta_no_se_puede_modificar(self):
        id_venta = self.vender().data["id_venta"]
        respuesta = self.client.patch(f"{self.url}{id_venta}/", {"total": "1"}, format="json")
        self.assertEqual(respuesta.status_code, 405)
        self.assertEqual(Venta.objects.get().total, Decimal("14000"))

    def test_contado_sin_cliente_va_a_consumidor_final(self):
        respuesta = self.vender(cliente=None)
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["cliente"], 1)
