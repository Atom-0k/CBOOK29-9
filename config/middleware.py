"""Middlewares de seguridad del proyecto.

* ApiErrorMiddleware        -> errores 500 en /api/* como JSON, sin stack traces.
* SecurityHeadersMiddleware -> headers de seguridad (Referrer-Policy, CSP).
* SesionExpiraMiddleware    -> expiración activa de sesiones (duracion_sesion_min).
"""
import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect

logger = logging.getLogger("cuaderno.security")

# Si la config institucional no trae duracion_sesion_min, se usa esto.
# Antes era 30 minutos, demasiado corto para una jornada de un docente.
DURACION_SESION_MIN_DEFAULT = 480
# Tope absoluto desde el login: aunque la persona no pare, a las 12 h se
# cierra la sesión y tiene que volver a entrar.
TOPE_ABSOLUTO_HORAS = 12


class ApiErrorMiddleware:
    """Devuelve JSON limpio en errores de endpoints /api/* y registra el error.

    En rutas no-API se respeta el comportamiento de Django (página de
    error de DEBUG si corresponde).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except Exception:
            if request.path.startswith("/api/"):
                logger.exception("Error interno en %s", request.path)
                return JsonResponse({"error": "Error interno del servidor"}, status=500)
            raise


class SecurityHeadersMiddleware:
    """Aplica headers de seguridad a todas las respuestas."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if "X-Content-Type-Options" not in response:
            response["X-Content-Type-Options"] = "nosniff"
        if "Referrer-Policy" not in response:
            response["Referrer-Policy"] = "same-origin"
        csp = getattr(settings, "SECURE_CONTENT_SECURITY_POLICY", "")
        if csp and "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = csp
        return response


class SesionExpiraMiddleware:
    """Expiración activa de sesión por inactividad, con ventana deslizante.

    La sesión se crea en login_view con la clave "_expira" (ISO). Si está
    vencida se limpia la sesión: JSON 401 para /api/* y redirect al login en
    el resto.

    Ventana deslizante: mientras la persona siga trabajando, "_expira" se
    corre hacia adelante en cada request, igual que la cookie (gracias a
    SESSION_SAVE_EVERY_REQUEST). Antes no se renovaba nada, así que a los
    `duracion_sesion_min` caía la sesión aunque siguiera usando la app: la
    pantalla quedaba con lo ya cargado y el primer request nuevo (descargar
    un PDF, abrir un detalle) devolvía 401.

    "_expira_max" es el tope absoluto desde el login, para que una sesión no
    pueda renovarse indefinidamente.
    """

    RENUEVA_MARGEN_SEG = 60

    def __init__(self, get_response):
        self.get_response = get_response

    def _corte(self, request):
        """Corta la sesión: 401 en /api/*, redirect al login en el resto."""
        if request.path.startswith("/api/"):
            return JsonResponse({"error": "Sesión expirada"}, status=401)
        return redirect("login")

    def __call__(self, request):
        session = getattr(request, "session", None)
        if session is None or not session.get("usuario_gmail"):
            return self.get_response(request)

        ahora = datetime.now()
        expira = session.get("_expira")
        try:
            vencida = datetime.fromisoformat(expira) < ahora
        except (TypeError, ValueError):
            vencida = True

        if vencida:
            session.flush()
            return self._corte(request)

        # Tope absoluto de la jornada, creado en el primer request en vivo.
        maximo = session.get("_expira_max")
        if not maximo:
            try:
                tope = ahora + timedelta(hours=TOPE_ABSOLUTO_HORAS)
            except OverflowError:
                tope = ahora
            session["_expira_max"] = tope.isoformat()
            maximo = session["_expira_max"]

        try:
            if datetime.fromisoformat(maximo) - ahora < timedelta(seconds=self.RENUEVA_MARGEN_SEG):
                # Pasó el tope absoluto: se cierra igual, para que una sesión
                # no viva indefinidamente por Renewal constante.
                session.flush()
                return self._corte(request)
        except (TypeError, ValueError):
            session.flush()
            return self._corte(request)

        # Se corre el vencimiento mientras haya margen antes del tope.
        # Import local: config.middleware se carga desde settings, y trae el
        # acceso a la configuración institucional sin acoplar el import.
        from cuaderno.auth import get_config

        try:
            duracion = int(get_config().get("duracion_sesion_min") or DURACION_SESION_MIN_DEFAULT)
        except (TypeError, ValueError):
            duracion = DURACION_SESION_MIN_DEFAULT
        nuevo = ahora + timedelta(minutes=max(duracion, 5))
        if nuevo.isoformat() < maximo:
            session["_expira"] = nuevo.isoformat()

        return self.get_response(request)
