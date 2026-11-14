"""Modificación y anulación de ventas (HU-05): una venta nunca se borra.

Cada prueba revisa las tres cosas que mueve una venta: el stock, la caja y la cuenta corriente.
"""

from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja, MovimientoCaja
from apps.catalogo.models import PrecioProducto
from apps.clientes.models import Cliente
from apps.inventario.models import MovimientoInventario
from apps.usuarios.models import RegistroActividad
from apps.ventas.models import CuentaCorriente, Venta

from .datos import crear_base, stock_de


class ModificarVentaTest(APITestCase):
    url = "/api/ventas/"

    def setUp(self):
        crear_base(self)
        self.caja_abierta = Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        self.cliente = Cliente.objects.create(nombre="Almacén Don Pepe")

    def cuerpo(self, cantidad="2", presentacion=None, **datos):
        cuerpo = {"modalidad": "CONTADO", "medio_pago": "EFECTIVO",
                  "detalles": [{"producto": self.producto.pk,
                                "presentacion": (presentacion or self.bandeja).pk, "cantidad": cantidad}]}
        cuerpo.update(datos)
        return cuerpo

    def vender(self, **datos):
        respuesta = self.client.post(self.url, self.cuerpo(**datos), format="json")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        return respuesta.data["id_venta"]

    def como_admin(self):
        self.client.force_login(self.admin)

    def modificar(self, id_venta, **datos):
        return self.client.put(f"{self.url}{id_venta}/", self.cuerpo(**datos), format="json")

    def efectivo_en_caja(self):
        from apps.caja.servicios import saldo_actual
        return saldo_actual(self.caja_abierta)

    # ---------- Modificación ----------

    def test_modificar_la_cantidad_ajusta_stock_y_caja(self):
        id_venta = self.vender(cantidad="2")          # 20 - 2 = 18 bandejas, $ 14.000 en caja
        self.como_admin()
        respuesta = self.modificar(id_venta, cantidad="5")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(respuesta.data["id_venta"], id_venta)     # misma venta, mismo número
        self.assertEqual(respuesta.data["total"], "35000.00")
        self.assertIsNotNone(respuesta.data["fecha_modificacion"])
        self.assertEqual(stock_de(self.producto), 15)               # 20 - 5
        self.assertEqual(self.efectivo_en_caja(), Decimal("35000"))
        # Los movimientos no se borran: quedan el egreso original, la devolución y el egreso nuevo.
        tipos = list(MovimientoInventario.objects.order_by("pk").values_list("tipo_movimiento", flat=True))
        self.assertEqual(tipos, ["EGRESO_VENTA", "AJUSTE_POSITIVO", "EGRESO_VENTA"])

    def test_modificar_cambia_producto_presentacion_y_modalidad(self):
        id_venta = self.vender(cantidad="2")
        self.como_admin()
        respuesta = self.modificar(id_venta, cantidad="1", presentacion=self.caja,
                                   modalidad="FIADO", medio_pago=None, cliente=self.cliente.pk)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(respuesta.data["modalidad"], "FIADO")
        self.assertEqual(respuesta.data["saldo_pendiente"], "40000.00")
        self.assertEqual(respuesta.data["pagos"], [])
        self.assertEqual(stock_de(self.producto), 14)               # 20 - 6 (una caja)
        self.assertEqual(self.efectivo_en_caja(), Decimal("0"))     # se devolvieron los $ 14.000

    def test_las_lineas_que_ya_estaban_conservan_su_precio(self):
        id_venta = self.vender(cantidad="2")
        PrecioProducto.objects.update(precio=Decimal("9000"))       # el precio sube después de vender
        self.como_admin()
        respuesta = self.modificar(id_venta, cantidad="3")
        self.assertEqual(respuesta.data["detalles"][0]["precio_unitario_aplicado"], "7000.00")
        self.assertEqual(respuesta.data["total"], "21000.00")

    def test_si_no_alcanza_el_stock_no_se_modifica_nada(self):
        id_venta = self.vender(cantidad="2")
        self.como_admin()
        respuesta = self.modificar(id_venta, cantidad="50")
        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(stock_de(self.producto), 18)
        self.assertEqual(Venta.objects.get().total, Decimal("14000"))
        self.assertEqual(self.efectivo_en_caja(), Decimal("14000"))

    def test_la_version_anterior_queda_en_el_registro_de_actividad(self):
        id_venta = self.vender(cantidad="2")
        self.como_admin()
        self.modificar(id_venta, cantidad="4")
        registro = RegistroActividad.objects.get(operacion="Modificación")
        self.assertIn("Antes:", registro.detalle)
        self.assertIn("$ 14.000,00", registro.detalle)

    def test_el_operador_no_puede_modificar(self):
        id_venta = self.vender()
        respuesta = self.modificar(id_venta, cantidad="5")
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(stock_de(self.producto), 18)

    def test_no_se_modifica_una_fiada_ya_cobrada(self):
        id_venta = self.vender(modalidad="FIADO", medio_pago=None, cliente=self.cliente.pk)
        cuenta = CuentaCorriente.objects.get()
        self.client.post(f"/api/cuentas-corrientes/{cuenta.pk}/cobrar/",
                         {"importe": "14000", "medio_pago": "EFECTIVO"}, format="json")
        self.como_admin()
        respuesta = self.modificar(id_venta, cantidad="1")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("ya se cobró", str(respuesta.data))

    # ---------- Anulación ----------

    def test_anular_devuelve_stock_y_efectivo_y_conserva_la_venta(self):
        id_venta = self.vender(cantidad="2")
        self.como_admin()
        respuesta = self.client.post(f"{self.url}{id_venta}/anular/", {"motivo": "El cliente se arrepintió"},
                                     format="json")
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(respuesta.data["estado"], "ANULADA")
        self.assertEqual(respuesta.data["motivo_anulacion"], "El cliente se arrepintió")
        self.assertEqual(len(respuesta.data["detalles"]), 1)        # el detalle se conserva
        self.assertEqual(stock_de(self.producto), 20)
        self.assertEqual(self.efectivo_en_caja(), Decimal("0"))
        self.assertTrue(Venta.objects.filter(pk=id_venta).exists())
        retiro = MovimientoCaja.objects.get(tipo_movimiento="RETIRO")
        self.assertIn(f"Anulación de la venta {id_venta}", retiro.motivo)

    def test_anular_una_fiada_da_de_baja_la_deuda(self):
        id_venta = self.vender(modalidad="FIADO", medio_pago=None, cliente=self.cliente.pk)
        self.como_admin()
        self.client.post(f"{self.url}{id_venta}/anular/", {"motivo": "Error de carga"}, format="json")
        cuenta = CuentaCorriente.objects.get()
        self.assertEqual(cuenta.saldo_pendiente, 0)
        self.assertEqual(cuenta.estado, "CANCELADA")

    def test_anular_pide_motivo(self):
        id_venta = self.vender()
        self.como_admin()
        respuesta = self.client.post(f"{self.url}{id_venta}/anular/", {"motivo": ""}, format="json")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("motivo", respuesta.data)
        self.assertEqual(Venta.objects.get().estado, "CONFIRMADA")

    def test_una_venta_anulada_no_se_modifica_ni_se_vuelve_a_anular(self):
        id_venta = self.vender()
        self.como_admin()
        self.client.post(f"{self.url}{id_venta}/anular/", {"motivo": "Error"}, format="json")
        self.assertEqual(self.modificar(id_venta, cantidad="1").status_code, 400)
        otra = self.client.post(f"{self.url}{id_venta}/anular/", {"motivo": "Otra vez"}, format="json")
        self.assertEqual(otra.status_code, 400)
        self.assertEqual(stock_de(self.producto), 20)               # no devolvió dos veces

    def test_filtrar_por_estado(self):
        primera = self.vender()
        self.vender()
        self.como_admin()
        self.client.post(f"{self.url}{primera}/anular/", {"motivo": "Error"}, format="json")
        anuladas = self.client.get(self.url, {"estado": "ANULADA"}).data["results"]
        self.assertEqual([v["id_venta"] for v in anuladas], [primera])
