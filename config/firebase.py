"""Entrada desde la app móvil con Firebase (Sprint 6).

La app inicia sesión con Firebase Authentication y manda en cada pedido:
    Authorization: Bearer <token de Firebase>
Django comprueba que el token sea auténtico (firmado por Google, para nuestro proyecto y no vencido)
y lo asocia al usuario del sistema que tenga ese mismo email. Así los permisos por rol son los mismos
que en la web: Firebase dice QUIÉN es; Django decide QUÉ puede hacer.

Si el email no está dado de alta en Marpe (o el usuario está dado de baja), no entra.
No hace falta la librería firebase-admin: el token es un JWT y se verifica con las claves públicas de Google.
"""

import json
import time
from datetime import timedelta
from urllib.error import URLError
from urllib.request import urlopen

import jwt
from cryptography.x509 import load_pem_x509_certificate
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import authentication, exceptions

CLAVES_GOOGLE = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cache = {"claves": {}, "vence": 0}


def claves_publicas():
    """Certificados con los que Google firma los tokens. Se guardan en memoria el tiempo que Google indica."""
    if time.time() < _cache["vence"]:
        return _cache["claves"]
    with urlopen(CLAVES_GOOGLE, timeout=5) as respuesta:  # noqa: S310 (dirección fija de Google)
        claves = json.load(respuesta)
        edad = 3600
        for parte in (respuesta.headers.get("Cache-Control") or "").split(","):
            if parte.strip().startswith("max-age="):
                edad = int(parte.strip()[8:])
    _cache.update(claves=claves, vence=time.time() + edad)
    return _cache["claves"]


def verificar_token(token, proyecto):
    """Devuelve los datos del token si es válido; si no, lanza AuthenticationFailed."""
    try:
        cabecera = jwt.get_unverified_header(token)
        certificado = claves_publicas().get(cabecera.get("kid"))
        if certificado is None:
            raise exceptions.AuthenticationFailed("Token de Firebase con firma desconocida.")
        datos = jwt.decode(
            token,
            key=load_pem_x509_certificate(certificado.encode()).public_key(),
            algorithms=["RS256"],
            audience=proyecto,
            issuer=f"https://securetoken.google.com/{proyecto}",
            options={"require": ["exp", "iat", "sub"]},
            leeway=10,
        )
    except jwt.ExpiredSignatureError as error:
        raise exceptions.AuthenticationFailed("La sesión de Firebase venció: volvé a entrar.") from error
    except (jwt.InvalidTokenError, ValueError) as error:
        raise exceptions.AuthenticationFailed("Token de Firebase inválido.") from error
    except (URLError, TimeoutError) as error:
        raise exceptions.AuthenticationFailed("No se pudo verificar el token de Firebase. Probá de nuevo.") from error
    if not datos.get("email"):
        raise exceptions.AuthenticationFailed("La cuenta de Firebase no tiene email.")
    if not datos.get("email_verified"):
        raise exceptions.AuthenticationFailed("Primero verificá tu email (te llegó un correo de Firebase).")
    return datos


def anotar_ingreso(usuario):
    """La app no pasa por el login de la web: sin esto, «Último ingreso» diría «Nunca».

    Cada pedido de la app trae el token, así que se anota como mucho una vez cada 5 minutos
    (update directo, sin tocar el resto del usuario).
    """
    ahora = timezone.now()
    if usuario.last_login is None or ahora - usuario.last_login > timedelta(minutes=5):
        get_user_model().objects.filter(pk=usuario.pk).update(last_login=ahora)
        usuario.last_login = ahora


class FirebaseAuthentication(authentication.BaseAuthentication):
    """Se usa solo si el pedido trae «Authorization: Bearer …». La web sigue entrando con su sesión."""

    def authenticate(self, request):
        cabecera = request.headers.get("Authorization", "")
        if not cabecera.startswith("Bearer "):
            return None
        proyecto = getattr(settings, "FIREBASE_PROJECT_ID", "")
        if not proyecto:
            raise exceptions.AuthenticationFailed("El servidor no tiene configurado Firebase (FIREBASE_PROJECT_ID).")
        datos = verificar_token(cabecera[7:].strip(), proyecto)

        usuario = get_user_model().objects.filter(email__iexact=datos["email"]).first()
        if usuario is None or not usuario.is_active:
            raise exceptions.AuthenticationFailed(
                f"{datos['email']} no está habilitado en Marpe. Pedile al administrador que te dé de alta con ese email."
            )
        anotar_ingreso(usuario)
        return usuario, datos

    def authenticate_header(self, request):
        return 'Bearer realm="marpe"'
