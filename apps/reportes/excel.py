"""Excel del reporte: una hoja de resumen y una por cada tipo de movimiento, listo para filtrar y sumar."""

from io import BytesIO

from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .calculos import compras_del_periodo, gastos_del_periodo, resumen, ventas_del_periodo

PESOS = '"$" #,##0.00'
FECHA = "DD/MM/YYYY"
FECHA_HORA = "DD/MM/YYYY HH:MM"
MARRON = "6B4F3F"


def titulo(hoja, texto, desde, hasta):
    hoja["A1"] = texto
    hoja["A1"].font = Font(size=14, bold=True, color=MARRON)
    hoja["A2"] = f"Huevería Marpe · del {desde:%d/%m/%Y} al {hasta:%d/%m/%Y}"
    hoja["A2"].font = Font(italic=True, color="888888")


def tabla(hoja, fila, columnas, filas):
    """columnas: [(encabezado, ancho, formato)]. Escribe encabezado + filas y deja filtros."""
    for i, (texto, ancho, _) in enumerate(columnas, start=1):
        celda = hoja.cell(row=fila, column=i, value=texto)
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = PatternFill("solid", fgColor=MARRON)
        celda.alignment = Alignment(horizontal="center")
        hoja.column_dimensions[get_column_letter(i)].width = ancho
    for n, valores in enumerate(filas, start=fila + 1):
        for i, valor in enumerate(valores, start=1):
            celda = hoja.cell(row=n, column=i, value=valor)
            if columnas[i - 1][2]:
                celda.number_format = columnas[i - 1][2]
    ultima = fila + max(len(filas), 1)
    hoja.auto_filter.ref = f"A{fila}:{get_column_letter(len(columnas))}{ultima}"
    hoja.freeze_panes = hoja.cell(row=fila + 1, column=1)


def armar_excel(desde, hasta):
    datos = resumen(desde, hasta)
    libro = Workbook()

    # Resumen
    hoja = libro.active
    hoja.title = "Resumen"
    titulo(hoja, "Reporte del período", desde, hasta)
    g = datos["ganancia"]
    filas = [
        ("Ventas", datos["ventas"]["total"]),
        ("  en efectivo", datos["ventas"]["por_medio"]["efectivo"]),
        ("  por transferencia", datos["ventas"]["por_medio"]["transferencia"]),
        ("  fiado", datos["ventas"]["por_medio"]["fiado"]),
        ("Cantidad de ventas", datos["ventas"]["cantidad"]),
        ("Ticket promedio", datos["ventas"]["ticket_promedio"]),
        ("Compras", datos["compras"]["total"]),
        ("Gastos", datos["gastos"]["total"]),
        ("  fijos", datos["gastos"]["fijos"]),
        ("  variables", datos["gastos"]["variables"]),
        ("Costo de lo vendido", g["costo_vendido"]),
        ("Ganancia bruta (ventas − costo)", g["bruta"]),
        ("Ganancia neta (bruta − gastos)", g["neta"]),
        ("Balance (ventas − compras − gastos)", datos["balance"]),
        ("Ventas anuladas (no suman)", datos["ventas"]["anuladas"]["total"]),
    ]
    tabla(hoja, 4, [("Concepto", 38, None), ("Importe", 18, PESOS)], filas)
    hoja.cell(row=9, column=2).number_format = "0"  # cantidad de ventas
    for fila in (16, 17, 18):
        hoja.cell(row=fila, column=1).font = Font(bold=True)
        hoja.cell(row=fila, column=2).font = Font(bold=True)
    if g["sin_costo"]:
        hoja.cell(row=21, column=1, value=f"Sin costo cargado (no entran en la ganancia): {', '.join(g['sin_costo'])}")

    # Por huevo
    hoja = libro.create_sheet("Por huevo")
    titulo(hoja, "Lo vendido de cada huevo", desde, hasta)
    tabla(hoja, 4, [("Huevo", 24, None), ("Bandejas", 12, "0.00"), ("Vendido", 16, PESOS),
                    ("Costo", 16, PESOS), ("Ganancia bruta", 16, PESOS)],
          [(p["nombre"], p["bandejas"], p["vendido"], p["costo"], p["ganancia"]) for p in datos["productos"]])

    # Ventas
    hoja = libro.create_sheet("Ventas")
    titulo(hoja, "Ventas", desde, hasta)
    ventas = ventas_del_periodo(desde, hasta).select_related("cliente", "usuario").prefetch_related("pagos").order_by("fecha")
    tabla(hoja, 4, [("Nº", 8, None), ("Fecha", 18, FECHA_HORA), ("Cliente", 26, None), ("Forma", 12, None),
                    ("Medio", 16, None), ("Estado", 13, None), ("Total", 16, PESOS), ("Vendedor", 16, None)],
          [(v.pk, timezone.localtime(v.fecha).replace(tzinfo=None), v.cliente.nombre, v.get_modalidad_display(),
            ", ".join(p.get_medio_pago_display() for p in v.pagos.all()) or "—", v.get_estado_display(),
            v.total, v.usuario.get_username()) for v in ventas])

    # Compras
    hoja = libro.create_sheet("Compras")
    titulo(hoja, "Compras", desde, hasta)
    compras = compras_del_periodo(desde, hasta).select_related("proveedor").order_by("fecha")
    tabla(hoja, 4, [("Nº", 8, None), ("Fecha", 13, FECHA), ("Proveedor", 30, None), ("Total", 16, PESOS)],
          [(c.pk, c.fecha, c.proveedor.nombre, c.total) for c in compras])

    # Gastos
    hoja = libro.create_sheet("Gastos")
    titulo(hoja, "Gastos", desde, hasta)
    gastos = gastos_del_periodo(desde, hasta).order_by("fecha")
    tabla(hoja, 4, [("Fecha", 13, FECHA), ("Concepto", 30, None), ("Categoría", 18, None), ("Tipo", 12, None),
                    ("Medio", 16, None), ("Importe", 16, PESOS)],
          [(x.fecha, x.concepto, x.categoria, x.get_tipo_display(), x.get_medio_pago_display(), x.importe) for x in gastos])

    salida = BytesIO()
    libro.save(salida)
    return salida.getvalue()
