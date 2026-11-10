"""Pruebas de la caja (S5-04, HU-10)."""

from rest_framework.test import APITestCase

from apps.caja.models import Caja

from .datos import crear_base


class CajaAPITest(APITestCase):
    url = "/api/cajas/"

    def setUp(self):
        crear_base(self)

    def abrir(self, saldo="10000"):
        return self.client.post(self.url, {"saldo_inicial": saldo}, format="json")

    def test_abrir_y_consultar_la_caja_actual(self):
        self.assertEqual(self.abrir().status_code, 201)
        actual = self.client.get(f"{self.url}actual/").data
        self.assertEqual(actual["estado"], "ABIERTA")
        self.assertEqual(actual["saldo_actual"], "10000.00")

    def test_no_se_pueden_abrir_dos_cajas(self):
        self.abrir()
        respuesta = self.abrir()
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("Ya hay una caja abierta", str(respuesta.data))

    def test_ingreso_y_retiro_manual_con_motivo(self):
        caja = self.abrir().data["id_caja"]
        url = f"{self.url}{caja}/movimientos/"
        self.client.post(url, {"tipo_movimiento": "INGRESO_MANUAL", "importe": "5000", "motivo": "Cambio"}, format="json")
        self.client.post(url, {"tipo_movimiento": "RETIRO", "importe": "3000", "motivo": "Al banco"}, format="json")
        self.assertEqual(self.client.get(f"{self.url}actual/").data["saldo_actual"], "12000.00")
        self.assertEqual(len(self.client.get(url).data), 2)

    def test_retiro_sin_motivo_se_rechaza(self):
        caja = self.abrir().data["id_caja"]
        respuesta = self.client.post(f"{self.url}{caja}/movimientos/",
                                     {"tipo_movimiento": "RETIRO", "importe": "100", "motivo": ""}, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("motivo", respuesta.data)

    def test_cierre_calcula_esperado_y_diferencia(self):
        caja = self.abrir().data["id_caja"]
        respuesta = self.client.post(f"{self.url}{caja}/cerrar/", {"efectivo_contado": "9500"}, format="json")
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["saldo_esperado"], "10000.00")
        self.assertEqual(respuesta.data["diferencia"], "-500.00")  # faltan $ 500
        self.assertEqual(Caja.objects.get().estado, "CERRADA")

    def test_caja_cerrada_no_acepta_movimientos_ni_otro_cierre(self):
        caja = self.abrir().data["id_caja"]
        self.client.post(f"{self.url}{caja}/cerrar/", {"efectivo_contado": "10000"}, format="json")
        otro_cierre = self.client.post(f"{self.url}{caja}/cerrar/", {"efectivo_contado": "10000"}, format="json")
        movimiento = self.client.post(f"{self.url}{caja}/movimientos/",
                                      {"tipo_movimiento": "INGRESO_MANUAL", "importe": "1", "motivo": "x"}, format="json")
        self.assertEqual(otro_cierre.status_code, 400)
        self.assertEqual(movimiento.status_code, 400)

    def test_sin_sesion_no_se_puede_usar(self):
        self.client.logout()
        self.assertEqual(self.abrir().status_code, 403)
