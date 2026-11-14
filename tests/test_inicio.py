"""Pruebas de la pantalla de Inicio (resumen del día con datos reales)."""

from datetime import date

from rest_framework.test import APITestCase

from apps.caja.models import Caja

from .datos import crear_base


class InicioAPITest(APITestCase):
    url = "/api/inicio/"

    def setUp(self):
        crear_base(self)
        Caja.objects.create(saldo_inicial=1000, usuario_apertura=self.operador)
        self.client.force_login(self.admin)
        self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "fecha": date.today().isoformat(), "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "5", "precio_unitario": "5000"}]},
            format="json")
        self.client.force_login(self.operador)
        self.client.post("/api/ventas/", {"modalidad": "CONTADO", "medio_pago": "EFECTIVO", "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "2"}]}, format="json")
        self.client.post("/api/movimientos-inventario/", {"tipo_movimiento": "MERMA", "producto": self.producto.pk,
                                                          "presentacion": self.bandeja.pk, "cantidad": "1",
                                                          "motivo": "Se cayó una bandeja"}, format="json")

    def test_resumen_del_dia(self):
        datos = self.client.get(self.url).data
        self.assertEqual((datos["ventas"]["total"], datos["ventas"]["cantidad"]), (14000, 1))
        self.assertEqual(datos["ventas"]["por_medio"]["efectivo"], 14000)
        self.assertEqual(datos["caja"]["saldo_actual"], "15000.00")  # 1.000 inicial + 14.000 de la venta
        self.assertEqual(datos["stock"][0]["cantidad_bandejas"], "22.000000")  # 20 + 5 − 2 − 1
        self.assertEqual(len(datos["semana"]), 7)
        self.assertEqual(datos["semana"][-1]["total"], 14000)

    def test_el_operador_no_ve_compras_ni_gastos(self):
        tipos = [m["tipo"] for m in self.client.get(self.url).data["movimientos"]]
        self.assertEqual(sorted(tipos), ["Merma", "Venta"])

    def test_el_administrador_ve_tambien_las_compras(self):
        self.client.force_login(self.admin)
        tipos = [m["tipo"] for m in self.client.get(self.url).data["movimientos"]]
        self.assertIn("Compra", tipos)
        self.assertEqual(tipos[-1], "Compra")  # sin hora: al final

    def test_sin_sesion_no(self):
        self.client.logout()
        self.assertEqual(self.client.get(self.url).status_code, 403)
