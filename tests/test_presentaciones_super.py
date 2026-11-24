"""Súper en bandejas de 20 y cajas de 9 bandejas de 20 (rediseño del mostrador)."""

from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.caja.models import Caja
from apps.catalogo.models import PrecioProducto, Presentacion, Producto
from apps.inventario.models import Stock
from apps.proveedores.models import CostoProveedor

from .datos import crear_base, stock_de


class SuperBandejaDe20Test(APITestCase):
    def setUp(self):
        crear_base(self)
        self.super = Producto.objects.create(tipo_huevo="BLANCO", tamano="SÚPER")
        Stock.objects.create(producto=self.super, cantidad_bandejas=20, stock_minimo_bandejas=5)
        self.b20 = Presentacion.objects.create(nombre="Bandeja de 20", cantidad_bandejas_equivalentes=Decimal("0.666666"),
                                               formato="BANDEJA", huevos_por_bandeja=20)
        self.c20 = Presentacion.objects.create(nombre="Caja Súper", cantidad_bandejas_equivalentes=6,
                                               formato="CAJA", huevos_por_bandeja=20)
        PrecioProducto.objects.create(producto=self.super, presentacion=self.b20, precio=4500, fecha_desde=date(2026, 11, 1))
        CostoProveedor.objects.create(proveedor=self.proveedor, producto=self.super, presentacion=self.bandeja, precio_costo=4000)

    def test_vender_todas_las_bandejas_de_20_no_da_stock_negativo(self):
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)
        respuesta = self.client.post("/api/ventas/", {
            "modalidad": "CONTADO", "medio_pago": "EFECTIVO",
            "detalles": [{"producto": self.super.pk, "presentacion": self.b20.pk, "cantidad": "30"}]}, format="json")
        self.assertEqual(respuesta.status_code, 201)  # 30 bandejas de 20 = 600 huevos = 20 bandejas de 30
        self.assertLess(stock_de(self.super), Decimal("0.001"))
        self.assertGreaterEqual(stock_de(self.super), 0)

    def test_la_lista_de_precios_dice_el_formato(self):
        fila = next(p for p in self.client.get("/api/precios/").data if p["presentacion"] == self.b20.pk)
        self.assertEqual((fila["formato"], fila["huevos_por_bandeja"]), ("BANDEJA", 20))

    def test_bandeja_de_20_solo_para_super(self):
        self.client.force_login(self.admin)
        mal = self.client.post("/api/precios/confirmar/", {"producto": self.producto.pk, "presentacion": self.b20.pk,
                                                           "precio": "9000", "confirmar_bajo_equilibrio": True}, format="json")
        self.assertEqual(mal.status_code, 400)
        compra = self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.c20.pk, "cantidad": "1", "precio_unitario": "30000"}]}, format="json")
        self.assertIn("solo para huevos Súper", str(compra.data))
        bien = self.client.post("/api/precios/confirmar/", {"producto": self.super.pk, "presentacion": self.c20.pk,
                                                            "precio": "60000", "confirmar_bajo_equilibrio": True}, format="json")
        self.assertEqual(bien.status_code, 201)

    def test_sugeridos_no_ofrece_bandejas_de_20_a_otros_huevos(self):
        self.client.force_login(self.admin)
        filas = {f["producto"]: f for f in self.client.get("/api/precios/sugeridos/").data}
        self.assertNotIn(self.b20.pk, [p["presentacion"] for p in filas[self.producto.pk]["presentaciones"]])
        self.assertIn(self.b20.pk, [p["presentacion"] for p in filas[self.super.pk]["presentaciones"]])


class ValidacionPresentacionTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def alta(self, **datos):
        return self.client.post("/api/presentaciones/", datos, format="json")

    def test_nombre_y_equivalencia_invalidos_se_rechazan(self):
        self.assertIn("nombre", self.alta(nombre="6", cantidad_bandejas_equivalentes="6", formato="CAJA").data)
        self.assertIn("nombre", self.alta(nombre="caja", cantidad_bandejas_equivalentes="6", formato="CAJA").data)  # ya existe
        self.assertIn("cantidad_bandejas_equivalentes", self.alta(nombre="Cajita", cantidad_bandejas_equivalentes="-6").data)
        self.assertIn("cantidad_bandejas_equivalentes", self.alta(
            nombre="Caja rara", cantidad_bandejas_equivalentes="6.5", formato="CAJA", huevos_por_bandeja=30).data)

    def test_caja_super_de_9_bandejas_de_20(self):
        respuesta = self.alta(nombre="Caja Súper", cantidad_bandejas_equivalentes="6", formato="CAJA", huevos_por_bandeja=20)
        self.assertEqual(respuesta.status_code, 201)


class CajasDelMismoPrecioTest(APITestCase):
    """La Caja (6 × 30) y la Caja Súper (9 × 20) son 180 huevos: un solo precio para las dos."""

    setUp = SuperBandejaDe20Test.setUp

    def vigente(self, presentacion):
        return PrecioProducto.objects.get(producto=self.super, presentacion=presentacion, fecha_hasta__isnull=True).precio

    def test_guardar_la_caja_tambien_guarda_la_caja_super(self):
        self.client.force_login(self.admin)
        r = self.client.post("/api/precios/confirmar/", {"producto": self.super.pk, "presentacion": self.caja.pk,
                                                         "precio": "35000", "confirmar_bajo_equilibrio": True}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual((self.vigente(self.caja), self.vigente(self.c20)), (35000, 35000))

    def test_la_pantalla_muestra_una_sola_caja(self):
        self.client.force_login(self.admin)
        PrecioProducto.objects.create(producto=self.super, presentacion=self.caja, precio=35000, fecha_desde=date(2026, 11, 1))
        fila = next(f for f in self.client.get("/api/precios/sugeridos/").data if f["producto"] == self.super.pk)
        cajas = [p for p in fila["presentaciones"] if p["formato"] == "CAJA"]
        self.assertEqual([p["presentacion_nombre"] for p in cajas], ["Caja"])
        self.assertEqual(cajas[0]["comparte_con"], ["Caja Súper"])
        self.assertTrue(cajas[0]["gemelas_desparejas"])  # la Caja Súper todavía no tiene precio
        # El Blanco Mediano no tiene Caja Súper: su Caja no comparte con nadie.
        mediano = next(f for f in self.client.get("/api/precios/sugeridos/").data if f["producto"] == self.producto.pk)
        self.assertEqual(next(p for p in mediano["presentaciones"] if p["formato"] == "CAJA")["comparte_con"], [])
