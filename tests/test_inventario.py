"""Pruebas del stock, mermas y ajustes (S5-09, HU-06 y HU-08)."""

from rest_framework.test import APITestCase

from .datos import crear_base, stock_de


class InventarioAPITest(APITestCase):
    def setUp(self):
        crear_base(self)

    def mover(self, tipo, cantidad, motivo="Rotos en la descarga", presentacion=None):
        return self.client.post("/api/movimientos-inventario/", {
            "tipo_movimiento": tipo, "producto": self.producto.pk,
            "presentacion": (presentacion or self.bandeja).pk, "cantidad": cantidad, "motivo": motivo,
        }, format="json")

    def test_stock_por_presentacion(self):
        fila = self.client.get("/api/stock/").data[0]
        self.assertEqual(fila["por_presentacion"], [
            {"presentacion": "Caja", "cantidad": 3}, {"presentacion": "Bandeja", "cantidad": 2}])  # 1 caja = 6 bandejas

    def test_merma_descuenta_y_queda_registrada(self):
        self.assertEqual(self.mover("MERMA", "2").status_code, 201)
        self.assertEqual(stock_de(self.producto), 18)
        lista = self.client.get("/api/movimientos-inventario/", {"tipo": "MERMA"}).data["results"]
        self.assertEqual(lista[0]["motivo"], "Rotos en la descarga")

    def test_ajuste_positivo_suma(self):
        self.mover("AJUSTE_POSITIVO", "1", "Conteo físico")
        self.assertEqual(stock_de(self.producto), 21)

    def test_merma_sin_motivo_o_mayor_al_stock(self):
        self.assertIn("motivo", self.mover("MERMA", "1", motivo="").data)
        respuesta = self.mover("MERMA", "4", presentacion=self.caja)  # 24 bandejas > 20
        self.assertIn("Stock insuficiente", str(respuesta.data))

    def test_no_se_cargan_compras_ni_ventas_a_mano(self):
        self.assertIn("tipo_movimiento", self.mover("INGRESO_COMPRA", "5").data)

    def test_bajo_minimo_y_cambio_de_minimo(self):
        self.assertEqual(self.client.get("/api/stock/", {"bajo_minimo": "1"}).data, [])
        self.client.patch(f"/api/stock/{self.producto.pk}/", {"stock_minimo_bandejas": "30"}, format="json")
        self.assertTrue(self.client.get("/api/stock/").data[0]["bajo_minimo"])
