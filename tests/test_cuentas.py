"""Pruebas de la cuenta corriente y el cobro de deudas (S5-07, HU-05-G y HU-07)."""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja, MovimientoCaja
from apps.clientes.models import Cliente

from .datos import crear_base


class CuentasCorrientesAPITest(APITestCase):
    url = "/api/cuentas-corrientes/"

    def setUp(self):
        crear_base(self)
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        self.cliente = Cliente.objects.create(nombre="Almacén Don Pepe")
        venta = self.client.post("/api/ventas/", {
            "modalidad": "FIADO", "cliente": self.cliente.pk,
            "detalles": [{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "3"}],
        }, format="json").data
        self.cuenta = self.client.get(self.url, {"cliente": self.cliente.pk}).data["results"][0]
        self.assertEqual(self.cuenta["venta"], venta["id_venta"])

    def cobrar(self, importe, medio="EFECTIVO", **extra):
        return self.client.post(f"{self.url}{self.cuenta['id_cuenta']}/cobrar/",
                                {"importe": importe, "medio_pago": medio, **extra}, format="json")

    def test_la_deuda_aparece_pendiente_en_la_cuenta_del_cliente(self):
        self.assertEqual(self.cuenta["estado"], "PENDIENTE")
        self.assertEqual(self.cuenta["saldo_pendiente"], "21000.00")

    def test_cobro_total_en_efectivo_cancela_y_entra_a_caja(self):
        respuesta = self.cobrar("21000")
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["estado"], "CANCELADA")
        self.assertEqual(respuesta.data["saldo_pendiente"], "0.00")
        self.assertEqual(len(respuesta.data["pagos"]), 1)
        self.assertEqual(MovimientoCaja.objects.get().tipo_movimiento, "COBRO_DEUDA_EFECTIVO")

    def test_importe_distinto_del_saldo_se_rechaza(self):
        respuesta = self.cobrar("5000")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("importe", respuesta.data)

    def test_deuda_cancelada_no_se_cobra_dos_veces(self):
        self.cobrar("21000")
        self.assertEqual(self.cobrar("21000").status_code, 400)

    def test_transferencia_pide_referencia(self):
        self.assertIn("referencia_transferencia", self.cobrar("21000", "TRANSFERENCIA").data)
        self.assertEqual(self.cobrar("21000", "TRANSFERENCIA", referencia_transferencia="TRF-9").status_code, 200)

    def test_resumen_suma_lo_que_se_debe_por_cliente(self):
        respuesta = self.client.get(f"{self.url}resumen/")
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["total_pendiente"], Decimal("21000"))
        self.assertEqual(respuesta.data["cantidad"], 1)
        self.assertEqual(respuesta.data["por_cliente"][0]["deuda"], Decimal("21000"))
        self.cobrar("21000")
        self.assertEqual(self.client.get(f"{self.url}resumen/").data["total_pendiente"], 0)
