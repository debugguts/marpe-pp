"""Pruebas de la API REST de las tablas base (S4-13).

Cada prueba arma sus datos, hace un pedido a la API como lo haría la página web
y revisa la respuesta. Se corren con:
    docker compose exec web python manage.py test tests
"""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.catalogo.models import Producto
from apps.clientes.models import CONSUMIDOR_FINAL_ID, Cliente
from apps.proveedores.models import Proveedor


class ProveedoresAPITest(APITestCase):
    """HU-03: alta, validaciones, búsqueda y baja lógica de proveedores."""

    url = "/api/proveedores/"

    def test_alta_valida(self):
        respuesta = self.client.post(
            self.url, {"nombre": "Granja Prueba", "telefono": "387-4000000"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(respuesta.data["estado"], "ACTIVO")

    def test_rechaza_nombre_vacio(self):
        respuesta = self.client.post(self.url, {"nombre": "   "}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("nombre", respuesta.data)

    def test_rechaza_telefono_invalido(self):
        respuesta = self.client.post(
            self.url, {"nombre": "Granja Prueba", "telefono": "abc"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("telefono", respuesta.data)

    def test_busqueda_por_nombre(self):
        Proveedor.objects.create(nombre="Granja Los Andes")
        Proveedor.objects.create(nombre="Avícola del Valle")
        respuesta = self.client.get(self.url, {"search": "andes"})
        nombres = [p["nombre"] for p in respuesta.data["results"]]
        self.assertEqual(nombres, ["Granja Los Andes"])

    def test_baja_logica_no_borra(self):
        proveedor = Proveedor.objects.create(nombre="Granja Prueba")
        respuesta = self.client.delete(f"{self.url}{proveedor.pk}/")
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        proveedor.refresh_from_db()  # sigue existiendo en la base...
        self.assertEqual(proveedor.estado, "INACTIVO")  # ...pero dado de baja

    def test_filtro_por_estado(self):
        Proveedor.objects.create(nombre="Activo SA")
        Proveedor.objects.create(nombre="Inactivo SA", estado="INACTIVO")
        respuesta = self.client.get(self.url, {"estado": "INACTIVO"})
        nombres = [p["nombre"] for p in respuesta.data["results"]]
        self.assertEqual(nombres, ["Inactivo SA"])


class CatalogoAPITest(APITestCase):
    """HU-02: productos (tipo + tamaño único) y presentaciones."""

    def test_producto_muestra_nombre_legible(self):
        Producto.objects.create(tipo_huevo="BLANCO", tamano="MEDIANO")
        respuesta = self.client.get("/api/productos/")
        self.assertEqual(respuesta.data["results"][0]["nombre"], "Blanco Mediano")

    def test_rechaza_producto_repetido(self):
        Producto.objects.create(tipo_huevo="BLANCO", tamano="MEDIANO")
        respuesta = self.client.post(
            "/api/productos/", {"tipo_huevo": "BLANCO", "tamano": "MEDIANO"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_tamano_inexistente(self):
        respuesta = self.client.post(
            "/api/productos/", {"tipo_huevo": "BLANCO", "tamano": "GIGANTE"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_equivalencia_cero(self):
        respuesta = self.client.post(
            "/api/presentaciones/",
            {"nombre": "Media caja", "cantidad_bandejas_equivalentes": "0"},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)


class ClientesAPITest(APITestCase):
    """HU-07: ABM de clientes y protección de «Consumidor final»."""

    url = "/api/clientes/"

    def test_consumidor_final_existe(self):
        self.assertTrue(Cliente.objects.filter(pk=CONSUMIDOR_FINAL_ID).exists())

    def test_consumidor_final_no_se_modifica(self):
        respuesta = self.client.patch(
            f"{self.url}{CONSUMIDOR_FINAL_ID}/", {"nombre": "Otro"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Cliente.objects.get(pk=CONSUMIDOR_FINAL_ID).nombre, "Consumidor final")

    def test_consumidor_final_no_se_da_de_baja(self):
        respuesta = self.client.delete(f"{self.url}{CONSUMIDOR_FINAL_ID}/")
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Cliente.objects.get(pk=CONSUMIDOR_FINAL_ID).estado, "ACTIVO")

    def test_cliente_comun_se_modifica_y_se_da_de_baja(self):
        cliente = Cliente.objects.create(nombre="Kiosco Prueba")
        respuesta = self.client.patch(
            f"{self.url}{cliente.pk}/", {"telefono": "387-5000000"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        respuesta = self.client.delete(f"{self.url}{cliente.pk}/")
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        cliente.refresh_from_db()
        self.assertEqual(cliente.estado, "INACTIVO")
