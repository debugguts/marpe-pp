"""Pruebas de los gastos (S5-08, HU-09)."""

from datetime import date

from rest_framework.test import APITestCase

from apps.caja.models import Caja, MovimientoCaja

from .datos import crear_base


class GastosAPITest(APITestCase):
    url = "/api/gastos/"

    def setUp(self):
        crear_base(self)

    def gasto(self, **datos):
        cuerpo = {"fecha": str(date.today()), "concepto": "Alquiler del local", "categoria": "Alquiler",
                  "tipo": "FIJO", "importe": "150000", "medio_pago": "TRANSFERENCIA"}
        cuerpo.update(datos)
        return self.client.post(self.url, cuerpo, format="json")

    def test_alta_por_transferencia_no_toca_la_caja(self):
        respuesta = self.gasto()
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["tipo_texto"], "Fijo")
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_en_efectivo_sale_de_la_caja(self):
        Caja.objects.create(saldo_inicial=10000, usuario_apertura=self.operador)
        self.assertEqual(self.gasto(medio_pago="EFECTIVO", importe="4500", tipo="VARIABLE").status_code, 201)
        self.assertEqual(MovimientoCaja.objects.get().tipo_movimiento, "GASTO_EFECTIVO")

    def test_en_efectivo_sin_caja_abierta_no_se_guarda(self):
        respuesta = self.gasto(medio_pago="EFECTIVO")
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(self.client.get(self.url).data["count"], 0)

    def test_tipo_por_defecto_variable_y_tipo_invalido_rechazado(self):
        cuerpo = {"fecha": str(date.today()), "concepto": "Bolsas", "categoria": "Insumos",
                  "importe": "900", "medio_pago": "TRANSFERENCIA"}
        self.assertEqual(self.client.post(self.url, cuerpo, format="json").data["tipo"], "VARIABLE")
        self.assertIn("tipo", self.gasto(tipo="OTRO").data)

    def test_campos_vacios_e_importe_cero(self):
        respuesta = self.gasto(concepto="", importe="0")
        self.assertIn("concepto", respuesta.data)
        self.assertIn("importe", respuesta.data)

    def test_resumen_del_mes_separa_fijos_y_variables(self):
        self.gasto()
        self.gasto(concepto="Bolsas", categoria="Insumos", tipo="VARIABLE", importe="9000")
        resumen = self.client.get(f"{self.url}resumen/").data
        self.assertEqual(resumen["total"], 159000)
        self.assertEqual(resumen["fijos"], 150000)
        self.assertEqual(resumen["variables"], 9000)

    def test_editar_concepto_si_pero_importe_no(self):
        id_gasto = self.gasto().data["id_gasto"]
        ok = self.client.patch(f"{self.url}{id_gasto}/", {"concepto": "Alquiler noviembre"}, format="json")
        self.assertEqual(ok.status_code, 200)
        mal = self.client.patch(f"{self.url}{id_gasto}/", {"importe": "1"}, format="json")
        self.assertIn("importe", mal.data)
