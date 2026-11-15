"""Entrada desde la app móvil con un token de Firebase (Sprint 6).

No se llama a Google: se arma un certificado de prueba y se firman tokens como lo haría Firebase.
"""

import time
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from django.test import override_settings
from rest_framework.test import APITestCase

from .datos import crear_base

PROYECTO = "hueveria-marpe-prueba"
CLAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_nombre = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "prueba")])
CERTIFICADO = (
    x509.CertificateBuilder().subject_name(_nombre).issuer_name(_nombre).public_key(CLAVE.public_key())
    .serial_number(1).not_valid_before(datetime.now(UTC) - timedelta(days=1))
    .not_valid_after(datetime.now(UTC) + timedelta(days=1)).sign(CLAVE, hashes.SHA256())
    .public_bytes(serialization.Encoding.PEM).decode()
)


def token(email="operador@marpe.com", proyecto=PROYECTO, vence_en=3600):
    ahora = int(time.time())
    datos = {"iss": f"https://securetoken.google.com/{proyecto}", "aud": proyecto, "sub": "uid-123",
             "email": email, "iat": ahora - 5, "auth_time": ahora - 5, "exp": ahora + vence_en}
    return jwt.encode(datos, CLAVE, algorithm="RS256", headers={"kid": "clave-1"})


@override_settings(FIREBASE_PROJECT_ID=PROYECTO)
@patch("config.firebase.claves_publicas", return_value={"clave-1": CERTIFICADO})
class FirebaseTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.operador.email = "Operador@Marpe.com"
        self.operador.save()
        self.client.logout()  # la app no tiene sesión: solo el token

    def pedir(self, ruta, tok):
        return self.client.get(ruta, HTTP_AUTHORIZATION=f"Bearer {tok}")

    def test_entra_con_el_email_del_usuario(self, _):
        respuesta = self.pedir("/api/auth/yo/", token())
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data["rol"], "Operador")

    def test_respeta_el_rol(self, _):
        self.assertEqual(self.pedir("/api/inicio/", token()).status_code, 200)
        self.assertEqual(self.pedir("/api/reportes/resumen/", token()).status_code, 403)

    def test_email_que_no_esta_en_marpe(self, _):
        respuesta = self.pedir("/api/inicio/", token("otro@gmail.com"))
        self.assertEqual(respuesta.status_code, 403)
        self.assertIn("no está habilitado", respuesta.data["detail"])

    def test_usuario_dado_de_baja(self, _):
        self.operador.is_active = False
        self.operador.save()
        self.assertEqual(self.pedir("/api/inicio/", token()).status_code, 403)

    def test_token_vencido_o_de_otro_proyecto(self, _):
        self.assertIn("venció", self.pedir("/api/inicio/", token(vence_en=-60)).data["detail"])
        self.assertEqual(self.pedir("/api/inicio/", token(proyecto="otro-proyecto")).status_code, 403)

    def test_token_firmado_por_otro(self, _):
        falso = jwt.encode({"email": "operador@marpe.com"}, rsa.generate_private_key(public_exponent=65537, key_size=2048),
                           algorithm="RS256", headers={"kid": "clave-1"})
        self.assertEqual(self.pedir("/api/inicio/", falso).status_code, 403)

    def test_la_web_sigue_entrando_con_sesion(self, _):
        self.client.force_login(self.operador)
        self.assertEqual(self.client.get("/api/inicio/").status_code, 200)
        self.client.logout()
        self.assertEqual(self.client.get("/api/inicio/").status_code, 403)


class EmailDeUsuarioTest(APITestCase):
    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)

    def test_el_email_no_se_repite(self):
        datos = {"username": "lucia", "first_name": "Lucía", "rol": "Operador", "clave": "huevos-frescos-1"}
        self.assertEqual(self.client.post("/api/usuarios/", datos | {"email": "Lucia@Gmail.com"}).status_code, 201)
        respuesta = self.client.post("/api/usuarios/", datos | {"username": "lucia2", "email": "lucia@gmail.com"})
        self.assertIn("email", respuesta.data)
