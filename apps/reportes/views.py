"""Reportes (Sprint 6 · solo administrador).

GET /api/reportes/resumen/?desde=AAAA-MM-DD&hasta=AAAA-MM-DD   cifras del período (JSON)
GET /api/reportes/excel/?desde=...&hasta=...                    el mismo reporte en un Excel (.xlsx)
El PDF lo arma el navegador con «Imprimir» (la pantalla tiene una hoja de impresión propia).
"""

from django.http import HttpResponse
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from config.permisos import EsAdministrador

from .calculos import leer_periodo, resumen
from .excel import armar_excel


def periodo_de(request):
    desde, hasta, errores = leer_periodo(request.query_params)
    if errores:
        raise ValidationError(errores)
    return desde, hasta


class ResumenReporteView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        return Response(resumen(*periodo_de(request)))


class ExcelReporteView(APIView):
    permission_classes = [EsAdministrador]

    def get(self, request):
        desde, hasta = periodo_de(request)
        contenido = armar_excel(desde, hasta)
        respuesta = HttpResponse(
            contenido, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        respuesta["Content-Disposition"] = f'attachment; filename="marpe-reporte-{desde}-a-{hasta}.xlsx"'
        return respuesta
