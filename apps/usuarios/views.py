from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, PerfilSerializer, UsuarioActualSerializer


class LoginView(APIView):
    """POST /api/auth/login/  →  inicia sesión con usuario y clave (HU-01-C).

    Como mucho 8 intentos por minuto desde la misma dirección (S-seguridad V1): después responde 429.
    """

    permission_classes = [AllowAny]
    throttle_scope = "login"

    def post(self, request):
        datos = LoginSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        usuario = authenticate(
            request,
            username=datos.validated_data["usuario"],
            password=datos.validated_data["clave"],
        )
        if usuario is None:
            # No decimos qué dato falló, para no darle pistas a un intruso.
            return Response(
                {"detail": "Usuario o clave incorrectos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        login(request, usuario)  # Django guarda la sesión en una cookie
        return Response(UsuarioActualSerializer(usuario).data)


class LogoutView(APIView):
    """POST /api/auth/logout/  →  cierra la sesión."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class YoView(APIView):
    """GET /api/auth/yo/  →  quién está conectado.
    PATCH /api/auth/yo/  →  "Editar perfil": cambia el nombre propio o la clave propia.

    La web lo llama al abrir: si responde 401, muestra la pantalla de login.
    También entrega la cookie CSRF que la web necesita para enviar formularios.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "No iniciaste sesión."}, status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(UsuarioActualSerializer(request.user).data)

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "No iniciaste sesión."}, status=status.HTTP_401_UNAUTHORIZED
            )
        datos = PerfilSerializer(request.user, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        usuario = datos.save()
        # Al cambiar la clave Django cerraría la sesión: así sigue conectado en esta pestaña.
        update_session_auth_hash(request, usuario)
        return Response(UsuarioActualSerializer(usuario).data)
