"""Comprobantes de venta y de compra (ticket de 80 mm, no fiscal)."""

from rest_framework.test import APITestCase

from apps.caja.models import Caja

from .datos import crear_base


class ComprobantesTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def test_comprobante_de_venta(self):
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        venta = self.client.post("/api/ventas/", {"modalidad": "CONTADO", "medio_pago": "EFECTIVO", "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "2"}]}, format="json").data
        respuesta = self.client.get(f"/api/ventas/{venta['id_venta']}/comprobante/")
        self.assertEqual(respuesta.status_code, 200)
        html = respuesta.content.decode()
        self.assertIn("COMPROBANTE DE VENTA", html)
        self.assertIn(f"0001-{venta['id_venta']:08d}", html)
        self.assertIn("$ 14.000", html)
        self.assertIn("NO VÁLIDO COMO FACTURA", html)
        self.assertIn("<svg", html)  # QR

    def test_comprobante_de_compra_anulada(self):
        compra = self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "3"}]}, format="json").data
        self.client.post(f"/api/compras/{compra['id_compra']}/anular/", {"motivo": "Se cargó dos veces"}, format="json")
        html = self.client.get(f"/api/compras/{compra['id_compra']}/comprobante/").content.decode()
        self.assertIn("COMPROBANTE DE COMPRA", html)
        self.assertIn("Granja Los Andes", html)
        self.assertIn("ANULADA", html)

    def test_sin_sesion_no_se_ve(self):
        self.client.logout()
        self.assertIn(self.client.get("/api/compras/1/comprobante/").status_code, (401, 403))
