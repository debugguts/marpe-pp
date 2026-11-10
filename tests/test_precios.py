"""Pruebas del precio sugerido (S5-10, HU-02-C)."""

from datetime import date
from decimal import Decimal

from rest_framework.test import APITestCase

from apps.catalogo.models import PrecioProducto
from apps.gastos.models import Gasto

from .datos import crear_base


class PreciosAPITest(APITestCase):
    def setUp(self):
        crear_base(self)
        hoy = date.today()
        # Compras del mes: 10 bandejas a $ 5.000 y 30 a $ 6.000 → promedio ponderado $ 5.750
        for cantidad, precio in [("10", "5000"), ("30", "6000")]:
            self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": [{
                "producto": self.producto.pk, "presentacion": self.maple.pk,
                "cantidad": cantidad, "precio_unitario": precio}]}, format="json")
        # Gastos fijos del mes: $ 40.000 entre 40 bandejas = $ 1.000 por bandeja
        Gasto.objects.create(fecha=hoy, concepto="Alquiler", categoria="Alquiler", tipo="FIJO",
                             importe=Decimal("40000"), medio_pago="TRANSFERENCIA", usuario=self.admin)
        Gasto.objects.create(fecha=hoy, concepto="Bolsas", categoria="Insumos", tipo="VARIABLE",
                             importe=Decimal("9000"), medio_pago="TRANSFERENCIA", usuario=self.admin)

    def test_sugerido_muestra_como_lo_calculo(self):
        fila = self.client.get("/api/precios/sugeridos/").data[0]
        self.assertEqual(fila["calculo"]["costo_bandeja"], Decimal("5750.00"))
        self.assertEqual(fila["calculo"]["gasto_fijo_bandeja"], Decimal("1000.00"))  # el variable no cuenta
        self.assertEqual(fila["calculo"]["equilibrio_bandeja"], Decimal("6750.00"))
        cajon = next(p for p in fila["presentaciones"] if p["presentacion"] == self.cajon.pk)
        self.assertEqual(cajon["sugerido"], Decimal("81000.00"))  # 12 bandejas

    def test_confirmar_precio_lo_deja_vigente_y_guarda_el_anterior(self):
        self.client.force_login(self.admin)
        respuesta = self.client.post("/api/precios/confirmar/", {
            "producto": self.producto.pk, "presentacion": self.maple.pk, "precio": "7500"}, format="json")
        self.assertEqual(respuesta.status_code, 201)
        self.assertEqual(respuesta.data["ganancia_estimada"], "750.00")
        historial = PrecioProducto.objects.filter(producto=self.producto, presentacion=self.maple)
        self.assertEqual(historial.count(), 2)
        self.assertEqual(historial.filter(fecha_hasta__isnull=True).get().precio, Decimal("7500"))

    def test_precio_bajo_el_equilibrio_pide_confirmar_de_nuevo(self):
        self.client.force_login(self.admin)
        datos = {"producto": self.producto.pk, "presentacion": self.maple.pk, "precio": "6000"}
        primera = self.client.post("/api/precios/confirmar/", datos, format="json")
        self.assertEqual(primera.status_code, 400)
        self.assertEqual(primera.data["codigo"], "bajo_equilibrio")
        segunda = self.client.post("/api/precios/confirmar/", {**datos, "confirmar_bajo_equilibrio": True}, format="json")
        self.assertEqual(segunda.status_code, 201)

    def test_el_operador_no_puede_confirmar_precios(self):
        respuesta = self.client.post("/api/precios/confirmar/", {
            "producto": self.producto.pk, "presentacion": self.maple.pk, "precio": "9000"}, format="json")
        self.assertEqual(respuesta.status_code, 403)

    def test_producto_sin_costos_avisa_que_faltan(self):
        from apps.catalogo.models import Producto
        Producto.objects.create(tipo_huevo="CASTAÑO", tamano="SÚPER")
        filas = self.client.get("/api/precios/sugeridos/").data
        castano = next(f for f in filas if f["producto_nombre"] == "Castaño Súper")
        self.assertIn("Faltan costos", castano["calculo"]["error"])
