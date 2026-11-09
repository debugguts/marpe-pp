"""Pruebas de los costos por proveedor (S4-11, HU-03-D)."""

from datetime import date

from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalogo.models import Presentacion, Producto
from apps.proveedores.models import CostoProveedor, Proveedor


class CostosProveedorAPITest(APITestCase):
    url = "/api/costos-proveedor/"

    def setUp(self):
        self.proveedor = Proveedor.objects.create(nombre="Granja Los Andes")
        self.producto = Producto.objects.create(tipo_huevo="BLANCO", tamano="MEDIANO")
        self.maple = Presentacion.objects.create(nombre="Maple", cantidad_bandejas_equivalentes=1)

    def cargar(self, precio, proveedor=None):
        return self.client.post(self.url, {
            "proveedor": (proveedor or self.proveedor).pk,
            "producto": self.producto.pk,
            "presentacion": self.maple.pk,
            "precio_costo": precio,
        }, format="json")

    def test_alta_queda_vigente(self):
        respuesta = self.cargar("5000")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(respuesta.data["fecha_hasta"])
        self.assertEqual(respuesta.data["producto_nombre"], "Blanco Mediano")

    def test_costo_nuevo_pasa_el_anterior_al_historial(self):
        self.cargar("5000")
        self.cargar("5600")
        anterior, nuevo = CostoProveedor.objects.order_by("id_costo")
        self.assertEqual(anterior.fecha_hasta, date.today())  # cerrado hoy
        self.assertIsNone(nuevo.fecha_hasta)  # el único vigente
        vigentes = self.client.get(self.url, {"vigentes": "1"}).data["results"]
        self.assertEqual([c["precio_costo"] for c in vigentes], ["5600.00"])

    def test_rechaza_precio_cero(self):
        self.assertEqual(self.cargar("0").status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_proveedor_dado_de_baja(self):
        inactivo = Proveedor.objects.create(nombre="Avícola Cerrada", estado="INACTIVO")
        respuesta = self.cargar("5000", proveedor=inactivo)
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("proveedor", respuesta.data)

    def test_cambiar_precio_guarda_el_anterior_en_el_historial(self):
        id_viejo = self.cargar("5000").data["id_costo"]
        respuesta = self.client.patch(f"{self.url}{id_viejo}/", {"precio_costo": "5400"}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["precio_costo"], "5400.00")
        self.assertIsNone(respuesta.data["fecha_hasta"])  # el nuevo queda vigente
        viejo = CostoProveedor.objects.get(pk=id_viejo)
        self.assertEqual(viejo.precio_costo, 5000)  # el precio viejo no se pisa...
        self.assertEqual(viejo.fecha_hasta, date.today())  # ...queda cerrado en el historial

    def test_no_se_cambia_un_precio_del_historial(self):
        id_viejo = self.cargar("5000").data["id_costo"]
        self.cargar("5400")  # el de 5000 pasa al historial
        respuesta = self.client.patch(f"{self.url}{id_viejo}/", {"precio_costo": "6000"}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_se_puede_borrar(self):
        id_costo = self.cargar("5000").data["id_costo"]
        self.assertEqual(self.client.delete(f"{self.url}{id_costo}/").status_code,
                         status.HTTP_405_METHOD_NOT_ALLOWED)
