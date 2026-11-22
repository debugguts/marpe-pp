"""Reglas de los datos de un usuario: usuario, nombre, apellido y clave (corrección de UX · Usuarios)."""

from rest_framework.test import APITestCase

from apps.usuarios.models import Usuario

from .datos import crear_base

BUENO = {"username": "marta1", "first_name": "Marta", "last_name": "Gómez", "rol": "Operador",
         "clave": "galpon-norte-7"}


class ReglasDeUsuarioTest(APITestCase):
    url = "/api/usuarios/"

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def alta(self, **cambios):
        return self.client.post(self.url, BUENO | cambios, format="json")

    def test_alta_correcta_y_nombre_prolijo(self):
        r = self.alta(first_name="  maría   josé ", last_name="DE LA FUENTE")
        self.assertEqual(r.status_code, 201, r.data)
        usuario = Usuario.objects.get(username="marta1")
        self.assertEqual((usuario.first_name, usuario.last_name), ("María José", "De La Fuente"))

    def test_usuario_invalido(self):
        for malo in ["ab", "1marta", "marta lopez", "márta", "marta!", "a" * 21]:
            with self.subTest(usuario=malo):
                self.assertIn("username", self.alta(username=malo).data)

    def test_usuario_repetido_sin_importar_mayusculas(self):
        self.assertIn("username", self.alta(username="ADMIN").data)

    def test_nombre_y_apellido_solo_letras_y_obligatorios(self):
        for campo in ["first_name", "last_name"]:
            for malo in ["123", "Marta1", "M", "", "Ana@"]:
                with self.subTest(campo=campo, valor=malo):
                    self.assertIn(campo, self.alta(**{campo: malo}).data)
        sin_apellido = {k: v for k, v in BUENO.items() if k != "last_name"}
        self.assertIn("last_name", self.client.post(self.url, sin_apellido, format="json").data)

    def test_nombres_validos_con_tilde_apostrofe_y_guion(self):
        r = self.alta(first_name="Ñandú", last_name="O'Neill-Peña")
        self.assertEqual(r.status_code, 201, r.data)

    def test_clave_sin_numero_sin_letra_corta_o_con_el_usuario(self):
        for mala in ["galponnorte", "12345678", "gal7", "marta1-segura9"]:
            with self.subTest(clave=mala):
                self.assertIn("clave", self.alta(clave=mala).data)

    def test_editar_sin_tocar_la_clave_no_la_pide(self):
        r = self.client.patch(f"{self.url}{self.operador.pk}/", {"first_name": "Pedro", "last_name": "Ruiz",
                                                                   "clave": ""}, format="json")
        self.assertEqual(r.status_code, 200, r.data)


class ReglasDePerfilTest(APITestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create_user(username="camila", password="marpe-clave-1")
        self.client.force_authenticate(self.usuario)

    def test_nombre_con_numeros_se_rechaza(self):
        r = self.client.patch("/api/auth/yo/", {"first_name": "123"}, format="json")
        self.assertIn("first_name", r.data)

    def test_clave_nueva_igual_a_la_actual_se_rechaza(self):
        r = self.client.patch("/api/auth/yo/", {"clave_actual": "marpe-clave-1", "clave_nueva": "marpe-clave-1"},
                              format="json")
        self.assertIn("clave_nueva", r.data)
