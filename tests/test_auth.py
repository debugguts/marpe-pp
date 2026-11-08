"""Pruebas del inicio y cierre de sesión (S4-05) y del rol (S4-06)."""

from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APITestCase

from apps.usuarios.models import Usuario


class SesionAPITest(APITestCase):
    def setUp(self):
        self.operador = Usuario.objects.create_user(username="operador", password="marpe1234")
        self.admin = Usuario.objects.create_user(username="dueno", password="clave-segura-1")
        self.admin.groups.add(Group.objects.get_or_create(name="Administrador")[0])

    def iniciar(self, usuario, clave):
        return self.client.post(
            "/api/auth/login/", {"usuario": usuario, "clave": clave}, format="json"
        )

    def test_login_correcto_devuelve_rol(self):
        respuesta = self.iniciar("operador", "marpe1234")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["rol"], "Operador")

    def test_login_de_administrador(self):
        respuesta = self.iniciar("dueno", "clave-segura-1")
        self.assertEqual(respuesta.data["rol"], "Administrador")

    def test_clave_incorrecta_no_dice_que_fallo(self):
        respuesta = self.iniciar("operador", "otra")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(respuesta.data["detail"], "Usuario o clave incorrectos.")

    def test_yo_sin_sesion_responde_401(self):
        respuesta = self.client.get("/api/auth/yo/")
        self.assertEqual(respuesta.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_yo_con_sesion_y_logout(self):
        self.iniciar("operador", "marpe1234")
        self.assertEqual(self.client.get("/api/auth/yo/").data["username"], "operador")
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get("/api/auth/yo/").status_code, status.HTTP_401_UNAUTHORIZED)
