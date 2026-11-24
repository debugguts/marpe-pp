"""Rediseño S13: base de fijos del mes anterior (respaldo del día 1), listas por mes completo
y bandejas por línea de compra."""

from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.catalogo.precios import calcular, mes_actual
from apps.gastos.models import Gasto

from .datos import crear_base


class FijosDelMesAnteriorTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)
        self.desde, _ = mes_actual()
        self.mes_pasado = self.desde - timedelta(days=5)

    def gasto(self, dia, importe, tipo="FIJO"):
        return Gasto.objects.create(fecha=dia, concepto="Puesto de feria", categoria="Feria / Puesto", tipo=tipo,
                                    importe=Decimal(importe), medio_pago="TRANSFERENCIA", usuario=self.admin)

    def test_sin_fijos_este_mes_usa_los_del_mes_anterior(self):
        self.gasto(self.mes_pasado, "90000")
        base = self.client.get("/api/gastos/resumen/").data["base_precio"]
        self.assertTrue(base["respaldo"])
        self.assertEqual(Decimal(base["fijos"]), Decimal("90000"))
        self.assertEqual(base["mes"], self.mes_pasado.strftime("%Y-%m"))
        self.assertTrue(calcular(self.producto, [self.bandeja])["fijos_del_mes_anterior"])

    def test_con_fijos_este_mes_no_usa_el_respaldo(self):
        self.gasto(self.mes_pasado, "90000")
        self.gasto(date.today(), "50000")
        base = self.client.get("/api/gastos/resumen/").data["base_precio"]
        self.assertFalse(base["respaldo"])
        self.assertEqual(Decimal(base["fijos"]), Decimal("50000"))
        self.assertFalse(calcular(self.producto, [self.bandeja])["fijos_del_mes_anterior"])

    def test_los_anulados_y_variables_no_cuentan_como_respaldo(self):
        anulado = self.gasto(self.mes_pasado, "90000")
        anulado.estado, anulado.motivo_anulacion = "ANULADO", "Se cargó dos veces"
        anulado.save()
        self.gasto(self.mes_pasado, "4000", tipo="VARIABLE")
        base = self.client.get("/api/gastos/resumen/").data["base_precio"]
        self.assertFalse(base["respaldo"])
        self.assertEqual(Decimal(base["fijos"]), Decimal("0"))


class ListasDelMesTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def test_la_lista_de_gastos_trae_el_mes_completo(self):
        for i in range(25):
            Gasto.objects.create(fecha=date.today(), concepto=f"Bolsas {i}", categoria="Insumos", tipo="VARIABLE",
                                 importe=Decimal("100"), medio_pago="TRANSFERENCIA", usuario=self.admin)
        self.assertEqual(len(self.client.get("/api/gastos/").data["results"]), 20)
        self.assertEqual(len(self.client.get("/api/gastos/?page_size=500").data["results"]), 25)

    def test_cada_linea_de_compra_dice_cuantas_bandejas_sumo(self):
        self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "3"}]}, format="json")
        detalle = self.client.get("/api/compras/?page_size=500").data["results"][0]["detalles"][0]
        self.assertEqual(Decimal(detalle["bandejas"]), Decimal("3"))
