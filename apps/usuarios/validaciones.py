"""Reglas de los datos de un usuario (HU-01).

Las usan el alta/edición del administrador («Usuarios y roles») y «Editar perfil».
La web avisa lo mismo mientras se escribe (frontend/src/lib/reglasUsuario.js),
pero quien decide es el servidor: si alguien saltea la web, igual se rechaza.
"""

import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as ErrorDjango
from rest_framework import serializers

# Usuario: empieza con letra; solo minúsculas sin tilde, números, punto o guion bajo; de 3 a 20.
PATRON_USUARIO = re.compile(r"[a-z][a-z0-9._]{2,19}")
# Nombre o apellido: solo letras (con tildes y ñ); palabras separadas por un espacio, ' o -.
LETRA = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ"
PATRON_NOMBRE = re.compile(rf"[{LETRA}]+(?:[ '\-][{LETRA}]+)*")


def limpiar_usuario(valor):
    valor = (valor or "").strip().lower()
    if not PATRON_USUARIO.fullmatch(valor):
        raise serializers.ValidationError(
            "De 3 a 20 caracteres: empieza con una letra y lleva solo letras sin tilde, "
            "números, punto o guion bajo (sin espacios)."
        )
    return valor


def limpiar_nombre(valor, campo):
    """campo: «nombre» o «apellido», para el mensaje. Devuelve el texto prolijo: «maría josé» → «María José»."""
    valor = " ".join((valor or "").split())
    if not valor:
        raise serializers.ValidationError(f"Escribí el {campo}.")
    if not 2 <= len(valor) <= 40:
        raise serializers.ValidationError(f"El {campo} tiene que tener entre 2 y 40 letras.")
    if not PATRON_NOMBRE.fullmatch(valor):
        raise serializers.ValidationError(f"El {campo} lleva solo letras: sin números ni símbolos.")
    # Si lo escribieron todo en minúscula o todo en mayúscula, se pone la inicial en mayúscula.
    if valor.islower() or valor.isupper():
        valor = valor.title()
    return valor


def validar_clave(clave, usuario):
    """usuario: el que va a tener la clave (puede no estar guardado todavía).

    Primero las reglas que la web muestra en la lista de requisitos; después las de Django
    (clave muy común o muy parecida a los datos del usuario).
    """
    errores = []
    if len(clave) < 8:
        errores.append("Tiene que tener al menos 8 caracteres.")
    if not re.search(r"[^\W\d_]", clave):
        errores.append("Tiene que tener al menos una letra.")
    if not re.search(r"\d", clave):
        errores.append("Tiene que tener al menos un número.")
    minuscula = clave.lower()
    for dato in (usuario.username, usuario.first_name):
        if dato and len(dato) >= 3 and dato.lower() in minuscula:
            errores.append("No puede contener el usuario ni el nombre.")
            break
    if errores:
        raise serializers.ValidationError(errores)
    try:
        validate_password(clave, usuario)
    except ErrorDjango as error:
        raise serializers.ValidationError(list(error.messages))
