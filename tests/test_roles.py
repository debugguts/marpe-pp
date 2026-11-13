"""Quién puede hacer qué (taller de seguridad · S4-06): la regla está en la API, no solo en la pantalla."""

from rest_framework.test import APITestCase

from apps.usuarios.models import RegistroActividad, Usuario

from .datos import crear_base


class PermisosPorRolTest(APITestCase):
    def setUp(self):
        crear_base(self)  # deja la sesión iniciada como operador

    def test_sin_sesion_no_se_ve_nada(self):
        self.client.logout()
        for url in ["/api/proveedores/", "/api/clientes/", "/api/ventas/", "/api/stock/", "/api/usuarios/"]:
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_el_operador_consulta_las_tablas_base_pero_no_las_cambia(self):
        self.assertEqual(self.client.get("/api/productos/").status_code, 200)
        self.assertEqual(self.client.post("/api/proveedores/", {"nombre": "Granja Nueva"}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/presentaciones/", {"nombre": "Media caja",
                                          "cantidad_bandejas_equivalentes": "3"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/productos/{self.producto.pk}/").status_code, 403)

    def test_el_operador_da_de_alta_clientes(self):
        self.assertEqual(self.client.post("/api/clientes/", {"nombre": "Kiosco Sol"}, format="json").status_code, 201)

    def test_el_operador_no_carga_compras_ni_gastos(self):
        compra = self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": [
            {"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}]}, format="json")
        self.assertEqual(compra.status_code, 403)
        gasto = self.client.post("/api/gastos/", {"concepto": "Nafta", "categoria": "Combustible",
                                                  "importe": "1000", "medio_pago": "TRANSFERENCIA"}, format="json")
        self.assertEqual(gasto.status_code, 403)
        self.assertEqual(self.client.get("/api/compras/").status_code, 200)  # pero las puede consultar


class UsuariosTest(APITestCase):
    url = "/api/usuarios/"

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def test_el_operador_no_gestiona_usuarios(self):
        self.client.force_login(self.operador)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get("/api/actividad/").status_code, 403)

    def test_alta_con_rol_y_la_clave_queda_cifrada(self):
        respuesta = self.client.post(self.url, {"username": "Lucia", "first_name": "Lucía", "rol": "Operador",
                                                "clave": "mostrador-2026"}, format="json")
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        self.assertEqual(respuesta.data["rol"], "Operador")
        self.assertNotIn("clave", respuesta.data)
        usuario = Usuario.objects.get(username="lucia")
        self.assertTrue(usuario.check_password("mostrador-2026"))
        self.assertNotEqual(usuario.password, "mostrador-2026")
        self.assertTrue(self.client.login(username="lucia", password="mostrador-2026"))

    def test_clave_debil_o_faltante_se_rechaza(self):
        sin_clave = self.client.post(self.url, {"username": "pepe", "rol": "Operador"}, format="json")
        self.assertIn("clave", sin_clave.data)
        debil = self.client.post(self.url, {"username": "pepe", "rol": "Operador", "clave": "1234"}, format="json")
        self.assertIn("clave", debil.data)

    def test_cambiar_rol_a_administrador(self):
        respuesta = self.client.patch(f"{self.url}{self.operador.pk}/", {"rol": "Administrador"}, format="json")
        self.assertEqual(respuesta.data["rol"], "Administrador")
        self.client.force_login(self.operador)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_baja_logica_conserva_el_usuario_y_no_deja_entrar(self):
        respuesta = self.client.delete(f"{self.url}{self.operador.pk}/")
        self.assertEqual(respuesta.status_code, 204)
        self.operador.refresh_from_db()
        self.assertFalse(self.operador.is_active)
        self.assertFalse(self.client.login(username="operador", password="x"))
        self.client.force_login(self.admin)
        self.client.post(f"{self.url}{self.operador.pk}/reactivar/")
        self.assertTrue(self.client.login(username="operador", password="x"))

    def test_no_se_puede_dar_de_baja_a_si_mismo_ni_quedar_sin_administrador(self):
        self.assertEqual(self.client.delete(f"{self.url}{self.admin.pk}/").status_code, 400)
        cambio = self.client.patch(f"{self.url}{self.admin.pk}/", {"rol": "Operador"}, format="json")
        self.assertEqual(cambio.status_code, 400)
        self.assertIn("rol", cambio.data)

    def test_el_registro_de_actividad_se_consulta(self):
        self.client.post(self.url, {"username": "nuevo", "rol": "Operador", "clave": "mostrador-2026"}, format="json")
        registros = self.client.get("/api/actividad/", {"entidad": "Usuario"}).data["results"]
        self.assertEqual(registros[0]["operacion"], "Alta")
        self.assertEqual(registros[0]["usuario_nombre"], "admin")
        self.assertTrue(RegistroActividad.objects.exists())
