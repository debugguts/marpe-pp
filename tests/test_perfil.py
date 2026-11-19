"""Pruebas de "Editar perfil": cada usuario cambia su nombre y su clave (Sprint 11)."""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.usuarios.models import Usuario


class PerfilAPITest(APITestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create_user(username="camila", password="marpe-clave-1",
                                                   email="camila@ejemplo.com")
        self.client.force_authenticate(self.usuario)

    def test_cambia_el_nombre(self):
        r = self.client.patch("/api/auth/yo/", {"first_name": " Camila ", "last_name": "Quispe"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["nombre"], "Camila Quispe")

    def test_cambia_la_clave_con_la_actual(self):
        r = self.client.patch("/api/auth/yo/", {"clave_actual": "marpe-clave-1", "clave_nueva": "otra-clave-larga-9"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.usuario.refresh_from_db()
        self.assertTrue(self.usuario.check_password("otra-clave-larga-9"))

    def test_rechaza_si_la_clave_actual_no_es_correcta(self):
        r = self.client.patch("/api/auth/yo/", {"clave_actual": "cualquiera", "clave_nueva": "otra-clave-larga-9"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("clave_actual", r.data)

    def test_no_puede_cambiarse_el_rol_ni_el_email(self):
        self.client.patch("/api/auth/yo/", {"email": "otro@ejemplo.com", "is_superuser": True, "username": "jefa"}, format="json")
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.email, "camila@ejemplo.com")
        self.assertEqual(self.usuario.username, "camila")
        self.assertFalse(self.usuario.is_superuser)

    def test_sin_sesion_responde_401(self):
        self.client.force_authenticate(None)
        r = self.client.patch("/api/auth/yo/", {"first_name": "X"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)
