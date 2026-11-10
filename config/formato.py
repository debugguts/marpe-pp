from decimal import Decimal


def pesos(importe):
    """12345.5 → "$ 12.345,50" (para mensajes de error)."""
    texto = f"{Decimal(importe):,.2f}"
    return "$ " + texto.replace(",", "X").replace(".", ",").replace("X", ".")


def bandejas(cantidad):
    """Decimal("12.500000") → "12,5" (sin ceros de más)."""
    texto = f"{Decimal(cantidad):.2f}".rstrip("0").rstrip(".")
    return texto.replace(".", ",")
