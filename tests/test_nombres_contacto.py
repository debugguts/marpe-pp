"""Nombre y teléfono de clientes y proveedores: sin nombres hechos solo de números."""

from rest_framework.test import APITestCase

from apps.clientes.models import Cliente

from .datos import crear_base


class NombresDeContactoTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def alta(self, url, **datos):
        return self.client.post(url, datos, format="json")

    def test_cliente_con_nombre_de_numeros_se_rechaza(self):
        for nombre in ["44", "552", "12 34", "--", "1abc"]:
            self.assertIn("nombre", self.alta("/api/clientes/", nombre=nombre).data, nombre)
        self.assertFalse(Cliente.objects.exclude(pk=1).filter(nombre__in=["44", "552"]).exists())

    def test_nombres_validos_y_repetidos(self):
        self.assertEqual(self.alta("/api/clientes/", nombre="Kiosco 24 Horas").status_code, 201)
        self.assertEqual(self.alta("/api/clientes/", nombre="Almacén Don Pepe", telefono="387-4001001").status_code, 201)
        self.assertIn("nombre", self.alta("/api/clientes/", nombre="almacén don pepe").data)
        self.assertIn("nombre", self.alta("/api/proveedores/", nombre="granja los andes").data)  # ya existe

    def test_telefono_con_letras_o_corto_se_rechaza(self):
        self.assertIn("telefono", self.alta("/api/clientes/", nombre="María Gómez", telefono="abc123").data)
        self.assertIn("telefono", self.alta("/api/clientes/", nombre="María Gómez", telefono="12-34").data)
