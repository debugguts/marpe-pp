"""Sprint de seguridad (S-seguridad): límite de intentos de login, tope de líneas y cookies."""

from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle

from apps.caja.models import Caja

from .datos import crear_base

LIMITES_REALES = {"anon": "60/min", "user": "120/min", "login": "8/min"}


class LimiteDeLoginTest(APITestCase):
    """V1: quien prueba claves a ciegas queda frenado al 9.º intento del minuto."""

    def setUp(self):
        cache.clear()
        crear_base(self)
        self.client.logout()

    def tearDown(self):
        cache.clear()

    @mock.patch.object(ScopedRateThrottle, "THROTTLE_RATES", LIMITES_REALES)
    def test_el_noveno_intento_del_minuto_responde_429(self):
        for _ in range(8):
            r = self.client.post("/api/auth/login/", {"usuario": "operador", "clave": "mal"}, format="json")
            self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/login/", {"usuario": "operador", "clave": "x"}, format="json")
        self.assertEqual(r.status_code, 429)  # ni con la clave correcta: hay que esperar

    @mock.patch.object(UserRateThrottle, "THROTTLE_RATES", {"user": "3/min"})
    def test_con_sesion_tambien_hay_limite(self):
        self.client.force_login(self.operador)
        codigos = [self.client.get("/api/productos/").status_code for _ in range(4)]
        self.assertEqual(codigos, [200, 200, 200, 429])


class TopeDeLineasTest(APITestCase):
    """V2: una venta o compra con miles de líneas no llega a tocar la base."""

    def setUp(self):
        crear_base(self)
        self.client.force_login(self.admin)
        Caja.objects.create(saldo_inicial=0, usuario_apertura=self.operador)

    def lineas(self, n):
        return [{"producto": self.producto.pk, "presentacion": self.bandeja.pk, "cantidad": "1"}] * n

    def test_venta_de_51_lineas_se_rechaza(self):
        r = self.client.post("/api/ventas/", {"modalidad": "CONTADO", "medio_pago": "EFECTIVO",
                                              "detalles": self.lineas(51)}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("50 líneas", str(r.data["detalles"]))

    def test_compra_de_51_lineas_se_rechaza(self):
        r = self.client.post("/api/compras/", {"proveedor": self.proveedor.pk, "detalles": self.lineas(51)}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("50 líneas", str(r.data["detalles"]))

    def test_un_pedido_de_mas_de_512_kb_se_rechaza(self):
        r = self.client.post("/api/ventas/", {"modalidad": "CONTADO", "relleno": "x" * 600_000}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertNotIn(b"detalles", r.content)  # lo frena Django por el tamaño, antes de revisar los datos


class CookiesTest(APITestCase):
    """V3: la sesión no se puede leer desde JavaScript ni usar desde otro sitio."""

    def test_la_cookie_de_sesion_es_httponly_y_samesite(self):
        crear_base(self)
        self.client.logout()
        r = self.client.post("/api/auth/login/", {"usuario": "operador", "clave": "x"}, format="json")
        cookie = r.cookies["sessionid"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")

    @override_settings(SESSION_COOKIE_SECURE=True)
    def test_publicado_la_cookie_viaja_solo_por_https(self):
        crear_base(self)
        self.client.logout()
        r = self.client.post("/api/auth/login/", {"usuario": "operador", "clave": "x"}, format="json")
        self.assertTrue(r.cookies["sessionid"]["secure"])
