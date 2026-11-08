import re

from rest_framework import serializers

# Teléfono: números, espacios, guiones, + o paréntesis (por ejemplo "387-4001001").
TELEFONO = re.compile(r"^[0-9+\-\s()]{6,20}$")


def limpiar_nombre(valor):
    """Saca los espacios de los extremos y exige al menos 2 caracteres."""
    valor = valor.strip()
    if len(valor) < 2:
        raise serializers.ValidationError("Ingresá el nombre (mínimo 2 caracteres).")
    return valor


def limpiar_telefono(valor):
    """El teléfono es opcional: si viene vacío se guarda como NULL."""
    if valor in (None, ""):
        return None
    valor = valor.strip()
    if not TELEFONO.match(valor):
        raise serializers.ValidationError(
            "Usá solo números, espacios, guiones, + o paréntesis (6 a 20 caracteres)."
        )
    return valor
