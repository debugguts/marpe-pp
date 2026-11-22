"""Modificar y anular compras (Sprint C). Una compra movió stock: no se borra, se anula."""

from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.compras.models import Compra
from apps.inventario.models import MovimientoInventario
from apps.inventario.servicios import mover_stock
from apps.reportes.calculos import compras_del_periodo
from apps.usuarios.models import RegistroActividad

from .datos import crear_base, stock_de


class ModificarAnularCompraTest(APITestCase):
    url = "/api/compras/"

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def linea(self, cantidad, precio="5000"):
        return {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": str(cantidad), "precio_unitario": precio}

    def comprar(self, cantidad, precio="5000"):
        respuesta = self.client.post(self.url, {"proveedor": self.proveedor.pk, "detalles": [self.linea(cantidad, precio)]}, format="json")
        self.assertEqual(respuesta.status_code, 201)
        return respuesta.data["id_compra"]

    def modificar(self, pk, cantidad, precio="5000"):
        return self.client.put(f"{self.url}{pk}/", {"proveedor": self.proveedor.pk, "detalles": [self.linea(cantidad, precio)]}, format="json")

    def anular(self, pk, motivo="Se cargó dos veces"):
        return self.client.post(f"{self.url}{pk}/anular/", {"motivo": motivo}, format="json")

    def vender_por_fuera(self, bandejas):
        mover_stock(self.producto, Decimal(bandejas), MovimientoInventario.Tipo.AJUSTE_NEGATIVO, self.admin, "se vendió")

    def test_modificar_ajusta_el_stock_y_el_total(self):
        pk = self.comprar(2)
        self.assertEqual(stock_de(self.producto), 22)
        respuesta = self.modificar(pk, 5, "6000")
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["total"], "30000.00")
        self.assertIsNotNone(respuesta.data["fecha_modificacion"])
        self.assertEqual(stock_de(self.producto), 25)
        self.assertTrue(RegistroActividad.objects.filter(operacion="Modificación", detalle__startswith="Antes:").exists())

    def test_cambiar_solo_el_precio_funciona_aunque_ya_se_haya_vendido(self):
        pk = self.comprar(10)
        self.vender_por_fuera(25)  # quedan 5 bandejas: las 10 de la compra ya no están
        respuesta = self.modificar(pk, 10, "5500")
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["total"], "55000.00")
        self.assertEqual(stock_de(self.producto), 5)

    def test_anular_saca_los_huevos_y_guarda_el_motivo(self):
        pk = self.comprar(4)
        respuesta = self.anular(pk)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["estado"], "ANULADA")
        self.assertEqual(respuesta.data["motivo_anulacion"], "Se cargó dos veces")
        self.assertEqual(stock_de(self.producto), 20)
        self.assertEqual(MovimientoInventario.objects.filter(tipo_movimiento="INGRESO_COMPRA").count(), 1)  # no se borra

    def test_no_deja_anular_si_ya_se_vendio_y_no_queda_nada_a_medias(self):
        pk = self.comprar(4)
        self.vender_por_fuera(22)
        movimientos = MovimientoInventario.objects.count()
        respuesta = self.anular(pk)
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("No alcanza el stock para deshacer esta compra", str(respuesta.data))
        self.assertEqual(Compra.objects.get(pk=pk).estado, "CONFIRMADA")
        self.assertEqual(stock_de(self.producto), 2)
        self.assertEqual(MovimientoInventario.objects.count(), movimientos)

    def test_una_anulada_no_se_modifica_ni_se_vuelve_a_anular(self):
        pk = self.comprar(1)
        self.anular(pk)
        self.assertEqual(self.modificar(pk, 3).status_code, 400)
        self.assertEqual(self.anular(pk).status_code, 400)
        self.assertEqual(stock_de(self.producto), 20)

    def test_anular_pide_motivo(self):
        pk = self.comprar(1)
        respuesta = self.anular(pk, "  ")
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn("motivo", respuesta.data)
        self.assertEqual(stock_de(self.producto), 21)

    def test_no_se_puede_borrar(self):
        pk = self.comprar(1)
        self.assertEqual(self.client.delete(f"{self.url}{pk}/").status_code, 405)

    def test_el_operador_no_modifica_ni_anula(self):
        pk = self.comprar(1)
        self.client.force_login(self.operador)
        self.assertEqual(self.modificar(pk, 2).status_code, 403)
        self.assertEqual(self.anular(pk).status_code, 403)

    def test_se_puede_modificar_aunque_el_proveedor_este_dado_de_baja(self):
        pk = self.comprar(1)
        self.proveedor.estado = "INACTIVO"
        self.proveedor.save()
        self.assertEqual(self.modificar(pk, 2).status_code, 200)

    def test_los_reportes_no_cuentan_las_anuladas(self):
        pk = self.comprar(2)
        self.comprar(1)
        self.anular(pk)
        hoy = date.today()
        self.assertEqual(compras_del_periodo(hoy, hoy).count(), 1)
        self.assertEqual(self.client.get(self.url, {"estado": "ANULADA"}).data["count"], 1)
