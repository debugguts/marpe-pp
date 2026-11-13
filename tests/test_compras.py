"""Pruebas de las compras (S5-05, HU-04)."""

from rest_framework.test import APITestCase

from apps.compras.models import Compra
from apps.inventario.models import MovimientoInventario

from .datos import crear_base, stock_de


class ComprasAPITest(APITestCase):
    url = "/api/compras/"

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)  # compras, gastos y precios los carga el administrador

    def comprar(self, lineas, **extra):
        return self.client.post(self.url, {"proveedor": self.proveedor.pk, "detalles": lineas, **extra}, format="json")

    def test_compra_en_cajas_suma_bandejas_al_stock(self):
        respuesta = self.comprar([{"producto": self.producto.pk, "presentacion": self.caja.pk,
                                   "cantidad": "2", "precio_unitario": "60000"}])
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["total"], "120000.00")
        self.assertEqual(stock_de(self.producto), 20 + 12)  # 2 cajas = 12 bandejas
        self.assertEqual(MovimientoInventario.objects.get().tipo_movimiento, "INGRESO_COMPRA")

    def test_sin_precio_usa_el_costo_vigente_del_proveedor(self):
        respuesta = self.comprar([{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "10"}])
        self.assertEqual(respuesta.data["detalles"][0]["precio_unitario"], "5000.00")
        self.assertEqual(respuesta.data["total"], "50000.00")

    def test_sin_precio_ni_costo_cargado_avisa(self):
        respuesta = self.comprar([{"producto": self.producto.pk, "presentacion": self.caja.pk, "cantidad": "1"}])
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("no tiene costo cargado", str(respuesta.data))
        self.assertFalse(Compra.objects.exists())  # no queda nada a medias

    def test_filtra_por_proveedor(self):
        self.comprar([{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}])
        self.assertEqual(self.client.get(self.url, {"proveedor": self.proveedor.pk}).data["count"], 1)
        self.assertEqual(self.client.get(self.url, {"proveedor": 999}).data["count"], 0)
