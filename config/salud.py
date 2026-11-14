"""GET /api/salud/ → {"estado": "ok"}. Lo usa Render para saber si el servidor está vivo (y para despertarlo)."""

from django.db import connection
from django.http import JsonResponse


def salud(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return JsonResponse({"estado": "ok"})
