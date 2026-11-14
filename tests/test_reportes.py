"""Pruebas de los reportes (Sprint 6): cifras del período, ganancia y descarga en Excel."""

from datetime import date
from io import BytesIO

from openpyxl import load_workbook
from rest_framework.test import APITestCase

from apps.caja.models import Caja
from apps.clientes.models import Cliente

from .datos import crear_base


class ReportesAPITest(APITestCase):
    url = "/api/reportes/resumen/"

    def setUp(self):
        crear_base(self)
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        cliente = Cliente.objects.create(nombre="Almacén Don Pepe")
        hoy = date.today().isoformat()
        self.client.force_login(self.admin)

        # Compra: 10 bandejas a $ 5.000 → costo por bandeja del período $ 5.000
        self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "fecha": hoy, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "10", "precio_unitario": "5000"}]},
            format="json")
        # Ventas: 2 bandejas en efectivo ($ 14.000) y 1 caja fiada ($ 40.000) = 8 bandejas, $ 54.000
        self.vender(self.bandeja, "2")
        self.vender(self.caja, "1", modalidad="FIADO", cliente=cliente.pk)
        # Una venta anulada: queda informada pero no suma
        anulada = self.vender(self.bandeja, "1").data["id_venta"]
        self.client.post(f"/api/ventas/{anulada}/anular/", {"motivo": "Se cargó dos veces"}, format="json")
        # Gasto fijo por transferencia
        self.client.post("/api/gastos/", {"concepto": "Alquiler", "categoria": "Local", "tipo": "FIJO", "fecha": hoy,
                                          "importe": "6000", "medio_pago": "TRANSFERENCIA"}, format="json")

    def vender(self, presentacion, cantidad, **datos):
        cuerpo = {"modalidad": "CONTADO", "medio_pago": "EFECTIVO",
                  "detalles": [{"producto": self.producto.pk, "presentacion": presentacion.pk, "cantidad": cantidad}]}
        cuerpo.update(datos)
        return self.client.post("/api/ventas/", cuerpo, format="json")

    def test_cifras_del_periodo(self):
        datos = self.client.get(self.url).data
        self.assertEqual(datos["ventas"]["total"], 54000)
        self.assertEqual(datos["ventas"]["cantidad"], 2)
        self.assertEqual(datos["ventas"]["por_medio"], {"efectivo": 14000, "transferencia": 0, "fiado": 40000})
        self.assertEqual(datos["ventas"]["anuladas"], {"cantidad": 1, "total": 7000})
        self.assertEqual(datos["compras"]["total"], 50000)
        self.assertEqual(datos["gastos"]["fijos"], 6000)

    def test_ganancia_con_el_costo_promedio_de_las_compras(self):
        ganancia = self.client.get(self.url).data["ganancia"]
        self.assertEqual(ganancia["costo_vendido"], 40000)  # 8 bandejas × $ 5.000
        self.assertEqual(ganancia["bruta"], 14000)          # 54.000 − 40.000
        self.assertEqual(ganancia["neta"], 8000)            # 14.000 − 6.000 de gastos
        self.assertEqual(self.client.get(self.url).data["balance"], -2000)  # 54.000 − 50.000 − 6.000

    def test_lo_vendido_por_huevo_y_la_evolucion(self):
        datos = self.client.get(self.url).data
        huevo = datos["productos"][0]
        self.assertEqual((huevo["bandejas"], huevo["vendido"], huevo["ganancia"]), (8, 54000, 14000))
        hoy = [p for p in datos["evolucion"]["puntos"] if p["fecha"] == date.today().isoformat()][0]
        self.assertEqual((hoy["ventas"], hoy["compras"], hoy["gastos"]), (54000, 50000, 6000))

    def test_periodo_sin_movimientos(self):
        datos = self.client.get(self.url, {"desde": "2020-01-01", "hasta": "2020-01-31"}).data
        self.assertEqual((datos["ventas"]["total"], datos["ganancia"]["neta"]), (0, 0))
        self.assertEqual(len(datos["evolucion"]["puntos"]), 31)

    def test_fechas_invalidas(self):
        self.assertEqual(self.client.get(self.url, {"desde": "ayer"}).status_code, 400)
        respuesta = self.client.get(self.url, {"desde": "2026-11-10", "hasta": "2026-11-01"})
        self.assertIn("hasta", respuesta.data)

    def test_excel_con_todas_las_hojas(self):
        respuesta = self.client.get("/api/reportes/excel/")
        self.assertEqual(respuesta.status_code, 200)
        self.assertIn("attachment", respuesta["Content-Disposition"])
        libro = load_workbook(BytesIO(respuesta.content))
        self.assertEqual(libro.sheetnames, ["Resumen", "Por huevo", "Ventas", "Compras", "Gastos"])
        self.assertEqual(libro["Ventas"].max_row, 4 + 3)  # encabezado + 3 ventas (la anulada también figura)

    def test_solo_el_administrador(self):
        self.client.force_login(self.operador)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get("/api/reportes/excel/").status_code, 403)
