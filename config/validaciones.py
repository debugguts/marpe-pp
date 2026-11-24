import re

from rest_framework import serializers

# Teléfono: números, espacios, guiones, + o paréntesis (por ejemplo "387-4001001").
TELEFONO = re.compile(r"^[0-9+\-\s()]{6,20}$")


# Nombre de un cliente o proveedor: empieza con una letra y puede tener letras, números,
# espacios y . , ' - & / ( ) (por ejemplo "Almacén Don Pepe" o "Kiosco 24 Horas").
NOMBRE = re.compile(r"^[^\W\d_][\w\s.,'&/()\-]*$")


def limpiar_nombre(valor, repetidos=None):
    """Nombre de cliente o proveedor: al menos 3 letras, que empiece con letra y no repetido.

    repetidos: los registros con los que no puede coincidir (sin distinguir mayúsculas).
    """
    valor = re.sub(r"\s+", " ", valor.strip())
    if not valor:
        raise serializers.ValidationError("Escribí el nombre.")
    if len(valor) > 80:
        raise serializers.ValidationError("El nombre no puede pasar de 80 caracteres.")
    if sum(c.isalpha() for c in valor) < 3 or not NOMBRE.match(valor):
        raise serializers.ValidationError(
            "El nombre tiene que empezar con una letra y tener al menos 3 letras (no solo números o signos)."
        )
    if repetidos is not None and repetidos.filter(nombre__iexact=valor).exists():
        raise serializers.ValidationError("Ya hay uno cargado con ese nombre.")
    return valor


def limpiar_telefono(valor):
    """El teléfono es opcional: si viene vacío se guarda como NULL."""
    if valor in (None, ""):
        return None
    valor = valor.strip()
    digitos = sum(c.isdigit() for c in valor)
    if not TELEFONO.match(valor) or not 6 <= digitos <= 12:
        raise serializers.ValidationError(
            "Usá solo números, espacios, guiones, + o paréntesis (entre 6 y 12 números)."
        )
    return valor
