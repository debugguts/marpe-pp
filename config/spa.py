"""En producción Django también entrega la pantalla (React ya compilado), así todo vive en una sola dirección.

WhiteNoise sirve los archivos de frontend/dist (JS, CSS, imágenes). Cualquier otra ruta que no sea
/api/ ni /admin/ (por ejemplo /ventas o /reportes) devuelve index.html y React Router muestra la pantalla.
"""

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def pantalla(request, ruta=""):
    indice = Path(settings.FRONTEND_DIST) / "index.html"
    if not indice.exists():
        raise Http404("La pantalla no está compilada (falta frontend/dist).")
    respuesta = FileResponse(indice.open("rb"), content_type="text/html")
    respuesta["Cache-Control"] = "no-cache"  # el index siempre fresco; los assets llevan hash y se cachean
    return respuesta
