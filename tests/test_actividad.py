"""Pruebas del registro de actividad (S4-14, HU-01-E)."""

from rest_framework.test import APITestCase

from apps.clientes.models import CONSUMIDOR_FINAL_ID
from apps.usuarios.models import RegistroActividad, Usuario

from .datos import entrar_como_admin


class RegistroActividadTest(APITestCase):
    def test_alta_queda_registrada(self):
        entrar_como_admin(self)
        respuesta = self.client.post("/api/proveedores/", {"nombre": "Granja Prueba"}, format="json")
        anotacion = RegistroActividad.objects.get()
        self.assertEqual(anotacion.operacion, "Alta")
        self.assertEqual(anotacion.entidad_afectada, "Proveedor")
        self.assertEqual(anotacion.referencia_registro, str(respuesta.data["id_proveedor"]))

    def test_modificacion_y_baja_guardan_el_usuario(self):
        usuario = Usuario.objects.create_user(username="dueno", password="clave-segura-1")
        self.client.force_authenticate(usuario)  # simula que inició sesión
        id_cliente = self.client.post("/api/clientes/", {"nombre": "Kiosco"}, format="json").data["id_cliente"]
        self.client.patch(f"/api/clientes/{id_cliente}/", {"telefono": "387-5000000"}, format="json")
        self.client.delete(f"/api/clientes/{id_cliente}/")
        operaciones = list(RegistroActividad.objects.order_by("id_actividad").values_list("operacion", "usuario"))
        self.assertEqual(operaciones, [("Alta", usuario.pk), ("Modificación", usuario.pk), ("Baja", usuario.pk)])

    def test_intento_bloqueado_no_se_registra(self):
        entrar_como_admin(self)
        self.client.delete(f"/api/clientes/{CONSUMIDOR_FINAL_ID}/")  # responde 403
        self.assertFalse(RegistroActividad.objects.exists())
