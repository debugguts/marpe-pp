"""Arqueo ciego: el operador cierra la caja contando el efectivo sin saber cuánto debería haber."""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja

from .datos import crear_base

OCULTOS = ("saldo_actual", "saldo_esperado", "diferencia", "resumen")


class ArqueoCiegoTest(APITestCase):
    def setUp(self):
        crear_base(self)  # queda logueado el operador
        self.caja = Caja.objects.create(saldo_inicial=Decimal("10000"), usuario_apertura=self.operador)
        self.client.post("/api/ventas/", {"modalidad": "CONTADO", "medio_pago": "EFECTIVO", "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "2"}]}, format="json")

    def test_el_operador_no_ve_cuanto_deberia_haber(self):
        caja = self.client.get("/api/cajas/actual/").data
        self.assertTrue(caja["arqueo_ciego"])
        for campo in OCULTOS:
            self.assertNotIn(campo, caja)
        self.assertEqual(Decimal(caja["saldo_inicial"]), Decimal("10000"))  # lo contó él al abrir

    def test_el_administrador_ve_todo(self):
        self.client.force_login(self.admin)
        caja = self.client.get("/api/cajas/actual/").data
        self.assertFalse(caja["arqueo_ciego"])
        self.assertEqual(Decimal(caja["saldo_actual"]), Decimal("24000"))

    def test_al_cerrar_el_operador_no_ve_la_diferencia_pero_queda_guardada(self):
        cerrada = self.client.post(f"/api/cajas/{self.caja.pk}/cerrar/", {"efectivo_contado": "23000"}, format="json").data
        self.assertNotIn("diferencia", cerrada)
        self.assertNotIn("saldo_esperado", cerrada)
        self.assertEqual(Decimal(cerrada["efectivo_contado"]), Decimal("23000"))
        self.caja.refresh_from_db()
        self.assertEqual(self.caja.diferencia, Decimal("-1000"))  # falta plata: lo ve el administrador
        self.client.force_login(self.admin)
        historial = self.client.get("/api/cajas/").data["results"][0]
        self.assertEqual(Decimal(historial["diferencia"]), Decimal("-1000"))

    def test_el_historial_tampoco_muestra_diferencias_al_operador(self):
        self.client.post(f"/api/cajas/{self.caja.pk}/cerrar/", {"efectivo_contado": "24000"}, format="json")
        for caja in self.client.get("/api/cajas/").data["results"]:
            for campo in OCULTOS:
                self.assertNotIn(campo, caja)

    def test_un_retiro_de_mas_no_le_dice_al_operador_cuanto_hay(self):
        r = self.client.post(f"/api/cajas/{self.caja.pk}/movimientos/",
                             {"tipo_movimiento": "RETIRO", "importe": "999999", "motivo": "Al banco"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("$", str(r.data["importe"]))

    def test_inicio_no_le_muestra_el_efectivo_del_dia_al_operador(self):
        datos = self.client.get("/api/inicio/").data
        self.assertNotIn("por_medio", datos["ventas"])
        self.assertNotIn("saldo_actual", datos["caja"])
        self.client.force_login(self.admin)
        self.assertIn("por_medio", self.client.get("/api/inicio/").data["ventas"])
