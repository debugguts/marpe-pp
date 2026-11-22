"""Validar, modificar y anular gastos. Un gasto no se borra: se anula con motivo."""

from datetime import date, timedelta
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja, MovimientoCaja
from apps.gastos.models import Gasto

from .datos import crear_base


class AnularGastoTest(APITestCase):
    url = "/api/gastos/"

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def gasto(self, **datos):
        cuerpo = {"fecha": str(date.today()), "concepto": "Bolsas", "categoria": "Insumos",
                  "tipo": "VARIABLE", "importe": "3000", "medio_pago": "TRANSFERENCIA"}
        cuerpo.update(datos)
        return self.client.post(self.url, cuerpo, format="json")

    def anular(self, pk, motivo="Se cargó dos veces"):
        return self.client.post(f"{self.url}{pk}/anular/", {"motivo": motivo}, format="json")

    def test_importe_negativo_y_fecha_futura_se_rechazan(self):
        self.assertIn("importe", self.gasto(importe="-100").data)
        manana = str(date.today() + timedelta(days=1))
        self.assertIn("fecha", self.gasto(fecha=manana).data)
        self.assertIn("importe", self.gasto(importe="200000000").data)
        self.assertFalse(Gasto.objects.exists())

    def test_anular_en_efectivo_devuelve_la_plata_a_la_caja(self):
        Caja.objects.create(saldo_inicial=10000, usuario_apertura=self.operador)
        pk = self.gasto(medio_pago="EFECTIVO").data["id_gasto"]
        respuesta = self.anular(pk)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["estado"], "ANULADO")
        self.assertEqual(MovimientoCaja.objects.filter(tipo_movimiento="INGRESO_MANUAL").get().importe, 3000)

    def test_anular_por_transferencia_no_toca_la_caja(self):
        pk = self.gasto().data["id_gasto"]
        self.assertEqual(self.anular(pk).status_code, 200)
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_anular_pide_motivo_y_un_anulado_no_se_toca(self):
        pk = self.gasto().data["id_gasto"]
        self.assertIn("motivo", self.anular(pk, " ").data)
        self.anular(pk)
        self.assertEqual(self.anular(pk).status_code, 400)
        self.assertEqual(self.client.patch(f"{self.url}{pk}/", {"concepto": "Otra cosa"}, format="json").status_code, 400)

    def test_el_resumen_no_cuenta_los_anulados(self):
        pk = self.gasto(importe="5000").data["id_gasto"]
        self.gasto(importe="2000")
        self.anular(pk)
        self.assertEqual(Decimal(str(self.client.get(f"{self.url}resumen/").data["total"])), Decimal("2000"))

    def test_no_se_borra_y_el_operador_no_anula(self):
        pk = self.gasto().data["id_gasto"]
        self.assertEqual(self.client.delete(f"{self.url}{pk}/").status_code, 405)
        self.client.force_login(self.operador)
        self.assertEqual(self.anular(pk).status_code, 403)
