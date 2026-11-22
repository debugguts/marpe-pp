"""Textos legibles del registro de actividad (HU-01-E).

El registro guarda el texto interno de cada registro («MERMA 0.166665 (Castaño Mediano)»,
«Caja 6 (CERRADA)»). Acá se traduce para la pantalla, también para los registros viejos,
sin cambiar lo guardado.
"""

import re
from decimal import Decimal, InvalidOperation

# Nombre de cada tabla como lo entiende el negocio (el filtro de la web usa la misma lista).
ENTIDADES = {
    "Venta": "Venta",
    "Compra": "Compra",
    "Gasto": "Gasto",
    "Caja": "Caja",
    "MovimientoInventario": "Movimiento de inventario",
    "MovimientoCaja": "Movimiento de caja",
    "CuentaCorriente": "Cuenta corriente",
    "PrecioProducto": "Precio",
    "Producto": "Producto",
    "Presentacion": "Presentación",
    "Proveedor": "Proveedor",
    "Cliente": "Cliente",
    "Usuario": "Usuario",
}

TIPOS = {
    "INGRESO_COMPRA": "Ingreso por compra",
    "EGRESO_VENTA": "Egreso por venta",
    "MERMA": "Merma",
    "AJUSTE_POSITIVO": "Ajuste positivo",
    "AJUSTE_NEGATIVO": "Ajuste negativo",
    "VENTA_EFECTIVO": "Venta en efectivo",
    "COBRO_DEUDA_EFECTIVO": "Cobro de deuda en efectivo",
    "GASTO_EFECTIVO": "Gasto en efectivo",
    "INGRESO_MANUAL": "Ingreso manual",
    "RETIRO": "Retiro",
}


def nombre_entidad(entidad):
    return ENTIDADES.get(entidad, entidad)


def _numero(texto):
    try:
        return Decimal(texto)
    except (InvalidOperation, TypeError):
        return None


def pesos(texto):
    """«12500.00» → «$ 12.500» (sin centavos, como en el resto de la web)."""
    valor = _numero(texto)
    if valor is None:
        return texto
    return "$ " + f"{valor:,.0f}".replace(",", ".")


def cantidad(texto):
    """Bandejas → texto: 0.166665 → «5 huevos», 1 → «1 bandeja», 6 → «6 bandejas», 2.5 → «2,5 bandejas»."""
    valor = _numero(texto)
    if valor is None:
        return texto
    valor = abs(valor)
    if valor < 1:
        huevos = round(valor * 30)
        return f"{huevos} {'huevo' if huevos == 1 else 'huevos'}"
    redondo = valor.quantize(Decimal("0.1")).normalize()
    texto = f"{redondo:f}".replace(".", ",")
    return f"{texto} {'bandeja' if redondo == 1 else 'bandejas'}"


REGLAS = {
    "MovimientoInventario": (
        re.compile(r"([A-Z_]+) (-?[\d.]+) \((.+)\)"),
        lambda m: f"{TIPOS.get(m[1], m[1])} · {cantidad(m[2])} · {m[3][:1]}{m[3][1:].lower()}",
    ),
    "MovimientoCaja": (re.compile(r"([A-Z_]+) (-?[\d.]+)"), lambda m: f"{TIPOS.get(m[1], m[1])} · {pesos(m[2])}"),
    "Caja": (re.compile(r"Caja \d+ \((ABIERTA|CERRADA)\)"), lambda m: f"Caja {m[1].lower()}"),
    "Venta": (re.compile(r"Venta \d+ - (CONTADO|FIADO)"),
              lambda m: "Venta de contado" if m[1] == "CONTADO" else "Venta fiada"),
    "Compra": (re.compile(r"Compra \d+ - (\d{4})-(\d{2})-(\d{2})"), lambda m: f"Compra del {m[3]}/{m[2]}/{m[1]}"),
    "Gasto": (re.compile(r"(.+) \((-?[\d.]+)\)"), lambda m: f"{m[1]} · {pesos(m[2])}"),
    "CuentaCorriente": (re.compile(r"Cuenta \d+ \(saldo (-?[\d.]+)\)"), lambda m: f"Saldo pendiente {pesos(m[1])}"),
    "PrecioProducto": (re.compile(r"(.+): (-?[\d.]+)"), lambda m: f"{m[1]} · {pesos(m[2])}"),
}


def detalle_legible(entidad, detalle):
    """Devuelve el detalle para mostrar. Lo que no reconoce (un nombre, «Motivo: …») queda igual."""
    if not detalle:
        return ""
    regla = REGLAS.get(entidad)
    if regla:
        patron, armar = regla
        encontrado = patron.fullmatch(detalle)
        if encontrado:
            return armar(encontrado)
    return detalle
