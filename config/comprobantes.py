"""Comprobantes no fiscales en formato ticket de 80 mm (ventas y compras).

Se devuelven como una página HTML lista para imprimir o guardar como PDF desde el navegador
(Imprimir → Guardar como PDF). El QR lleva el código de control del comprobante.
"""

from decimal import Decimal
from io import BytesIO

import qrcode
import qrcode.image.svg
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone

PUNTO_DE_VENTA = 1


def pesos(importe):
    """12345.5 → "$ 12.345,50"; sin centavos si son cero → "$ 12.345"."""
    valor = Decimal(importe)
    texto = f"{valor:,.2f}" if valor % 1 else f"{valor:,.0f}"
    return "$ " + texto.replace(",", "X").replace(".", ",").replace("X", ".")


def cantidad(valor):
    texto = f"{Decimal(valor):.3f}".rstrip("0").rstrip(".")
    return texto.replace(".", ",")


def nombre_de(usuario):
    return (usuario.get_full_name() or usuario.username) if usuario else "—"


def qr_svg(texto):
    imagen = qrcode.make(texto, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=1)
    salida = BytesIO()
    imagen.save(salida)
    return salida.getvalue().decode("utf-8").split("?>", 1)[-1]  # sin la cabecera XML


def responder(contexto):
    codigo = contexto["codigo"]
    contexto["qr"] = qr_svg(f"MARPE|{codigo}|{contexto['fecha']}|{contexto['total']}")
    html = render_to_string("comprobantes/ticket.html", contexto)
    return HttpResponse(html, content_type="text/html; charset=utf-8")


def comprobante_venta(venta):
    fecha = timezone.localtime(venta.fecha)
    lineas = [{
        "producto": str(d.producto),
        "detalle": f"{cantidad(d.cantidad)} × {d.presentacion.nombre} a {pesos(d.precio_unitario_aplicado)}",
        "subtotal": pesos(d.subtotal),
    } for d in venta.detalles.select_related("producto", "presentacion")]
    pagos = [{"texto": p.get_medio_pago_display() + (f" · ref. {p.referencia_transferencia}" if p.referencia_transferencia else ""),
              "importe": pesos(p.importe)} for p in venta.pagos.all()]
    return responder({
        "titulo": "COMPROBANTE DE VENTA",
        "codigo": f"V-{PUNTO_DE_VENTA:04d}-{venta.pk:08d}",
        "numero": f"{PUNTO_DE_VENTA:04d}-{venta.pk:08d}",
        "fecha": fecha.strftime("%d/%m/%Y"), "hora": fecha.strftime("%H:%M"),
        "datos": [("Cliente", venta.cliente.nombre), ("Atendió", nombre_de(venta.usuario))],
        "lineas": lineas,
        "total": pesos(venta.total),
        "pagos": pagos or [{"texto": "Fiado: queda en la cuenta corriente", "importe": pesos(venta.total)}],
        "anulada": venta.estado == "ANULADA", "motivo": venta.motivo_anulacion,
        "modificada": bool(venta.fecha_modificacion),
        "saludo": "¡Gracias por su compra!",
    })


def comprobante_compra(compra):
    lineas = [{
        "producto": str(d.producto),
        "detalle": f"{cantidad(d.cantidad)} × {d.presentacion.nombre} a {pesos(d.precio_unitario)}",
        "subtotal": pesos(d.subtotal),
    } for d in compra.detalles.select_related("producto", "presentacion")]
    cargada = timezone.localtime(timezone.now())
    return responder({
        "titulo": "COMPROBANTE DE COMPRA",
        "codigo": f"C-{PUNTO_DE_VENTA:04d}-{compra.pk:08d}",
        "numero": f"{PUNTO_DE_VENTA:04d}-{compra.pk:08d}",
        "fecha": compra.fecha.strftime("%d/%m/%Y"), "hora": None,
        "datos": [("Proveedor", compra.proveedor.nombre), ("Cargó", nombre_de(compra.usuario))],
        "lineas": lineas,
        "total": pesos(compra.total),
        "pagos": [],
        "anulada": compra.estado == "ANULADA", "motivo": compra.motivo_anulacion,
        "modificada": bool(compra.fecha_modificacion),
        "saludo": f"Impreso el {cargada:%d/%m/%Y %H:%M} · Registro interno de compras",
    })
