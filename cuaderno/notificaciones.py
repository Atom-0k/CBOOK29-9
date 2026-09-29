"""Avisos por correo de las inasistencias.

Cada vez que se registra una inasistencia se encolan DOS avisos: uno para el
alumno y otro para su tutor. Los dos se envían siempre: si al tutor no se le
cargó el correo, simplemente queda pendiente de carga en Admin.

Decisiones de diseño:

  * Los correos NO se envían en el request. Se encolan en la colección
    `notificaciones` y los manda el comando
    `python manage.py enviar_notificaciones`. Si el servidor de correo está
    caído, tomar lista no puede dejar la asistencia a medio guardar.

  * El interruptor maestro es `notificaciones_email` de la configuración
    (Admin → Configuración). Si está apagado no se encola nada.

  * No se duplica el aviso: si el alumno ya estaba en ese mismo estado, no
    se vuelve a notificar. Volver a guardar la misma lista no genera correos
    nuevos; sólo un cambio de estado real dispara el aviso.

  * La clave de deduplicación es (alumno, fecha, tipo, turno/materia, estado,
    destinatario), así que reintentar el comando no duplica nada.
"""
import logging
from datetime import datetime

from .auth import _mongo_db, get_config, get_usuario_doc

logger = logging.getLogger(__name__)

COLECCION = "notificaciones"

# Estados que generan aviso. 'Tarde' se incluye porque la institución computa
# la tardanza como inasistencia cuando supera la tolerancia configurada; para
# que el aviso llegue igual al margen, se notifica cualquier tardanza marcada.
# Si en la institución sólo interesa la ausencia, sacar "Tarde" de acá.
ESTADOS_NOTIFICAN = {"Ausente", "Tarde"}

# Tope de reintentos antes de dar el aviso por fallido.
MAX_INTENTOS = 5

_indice_creado = False


def _asegurar_indice():
    """Evita avisos duplicados si dos requests concurrentes procesan lo mismo."""
    global _indice_creado
    if _indice_creado:
        return
    try:
        _mongo_db[COLECCION].create_index("clave", unique=True)
    except Exception:
        pass
    _indice_creado = True


def _nombre(doc):
    return f"{doc.get('Nombres', '')} {doc.get('Apellido', '')}".strip()


def emails_activos():
    """True si el administrador habilitó los avisos por correo."""
    try:
        return bool(get_config().get("notificaciones_email"))
    except Exception:
        return False


def _remitente(conf):
    """Dirección desde la que salen los avisos.

    Prioridad: 'email_remitente' de la configuración institucional, después
    EMAIL_DEFAULT_FROM_EMAIL del entorno y, por último, la cuenta de salida.
    Si nada está configurado se usa un localhost explícito: es preferible que
    el comando se queje de un remitente inválido a que reenvíe al alumno
    desde una dirección que nadie reconoce.
    """
    from django.conf import settings
    destino = (conf.get("email_remitente")
               or getattr(settings, "EMAIL_DEFAULT_FROM_EMAIL", "")
               or getattr(settings, "EMAIL_HOST_USER", "")
               or "no-reply@localhost")
    escuela = conf.get("nombre_escuela") or "Cuaderno Digital"
    return f"{escuela} <{destino}>"


def _contexto(registro):
    """Arma los datos del aviso a partir del registro de asistencia ya guardado."""
    tipo = registro.get("tipo") or "institucional"
    if tipo == "materia":
        donde = f"la materia de {registro.get('materia') or 'una materia'}"
    else:
        # "el turno de la mañana" / "el turno de la tarde", no "turno mañana".
        turno = (registro.get("turno") or "mañana").lower()
        donde = f"el turno de la {turno}"
    return {
        "tipo": tipo,
        "curso": registro.get("curso") or "",
        "fecha": registro.get("fecha") or "",
        "turno": registro.get("turno") or "",
        "materia": registro.get("materia") or "",
        "donde": donde,
        "estado": registro.get("estado") or "",
        "minutos": registro.get("minutosRetraso"),
        "observacion": (registro.get("observacion") or "").strip(),
    }


def _cuerpo(alumno, ctx, es_tutor):
    """Mensaje en texto plano. Sin HTML: los correos de aviso se leen mejor así."""
    # El espacio va adelante para que "Le informamos que" no quede con dos.
    quien = f" del alumno {alumno}" if es_tutor else ""
    detalle = ""
    if ctx["estado"] == "Tarde":
        min_ = ctx.get("minutos")
        detalle = (f"Llegó {min_} minutos tarde" if min_ else "Llegó tarde")
    else:
        detalle = "No se presentó"
    if ctx["observacion"]:
        detalle += f". Observación: {ctx['observacion']}"

    saludo = f"Estimada familia de {alumno}," if es_tutor else f"Hola {alumno},"
    return (
        f"{saludo}\n\n"
        f"Le informamos{quien} que el {ctx['fecha']}, en {ctx['donde']} del curso "
        f"{ctx['curso']}, se registró una inasistencia.\n\n"
        f"Estado: {ctx['estado']}. {detalle}.\n"
        f"Registró la asistencia: {ctx.get('registradoPor') or 'el equipo docente'}.\n\n"
        "Si cree que se trata de un error o quiere justificar la inasistencia, "
        f"comuníquese con la institución.\n\n"
        "Este mensaje se generó automáticamente."
    )


def _asunto(ctx):
    return (f"Inasistencia de {ctx['curso']} el {ctx['fecha']}"
            f" ({ctx['estado']})")


def encolar_inasistencia(registro):
    """Encola los avisos de una inasistencia. Devuelve cuántos se encolaron.

    No lanza excepciones: un aviso que no se puede encolar no debe impedir
    que la asistencia quede guardada.
    """
    estado = registro.get("estado")
    if estado not in ESTADOS_NOTIFICAN:
        return 0
    if not emails_activos():
        return 0

    try:
        _asegurar_indice()
        ctx = _contexto(registro)
        ctx["registradoPor"] = registro.get("registradoPor") or ""
        gmail_alumno = registro.get("alumnoGmail") or ""
        alumno_doc = get_usuario_doc(gmail_alumno)
        if not alumno_doc:
            return 0
        nombre_alumno = _nombre(alumno_doc) or gmail_alumno

        conf = get_config()
        remitente = _remitente(conf)

        # Se envía a los dos destinatarios, no como alternativas: si falta el
        # del tutor se omite ese aviso y queda claro en el motivo.
        destinatarios = [(gmail_alumno, nombre_alumno, False)]
        tutor = (alumno_doc.get("EmailTutor") or "").strip().lower()
        if tutor:
            destinatarios.append((tutor, nombre_alumno, True))

        ahora = datetime.now().isoformat()
        encolados = 0
        for direccion, nombre_destino, es_tutor in destinatarios:
            clave = "|".join([
                gmail_alumno, ctx["fecha"], ctx["tipo"],
                ctx["turno"], ctx["materia"], ctx["estado"],
                direccion.lower(),
            ])
            # La comprobación es explícita (y no sólo confiar en el índice
            # único) para que el conteo devuelto sea honesto y no dependa de
            # que la claveVincula exista en la base.
            if _mongo_db[COLECCION].find_one({"clave": clave}):
                continue
            try:
                _mongo_db[COLECCION].insert_one({
                    "clave": clave,
                    "para": direccion,
                    "esTutor": es_tutor,
                    "alumno": gmail_alumno,
                    "alumnoNombre": nombre_alumno,
                    "curso": ctx["curso"],
                    "fecha": ctx["fecha"],
                    "estado": ctx["estado"],
                    "asunto": _asunto(ctx),
                    "cuerpo": _cuerpo(nombre_alumno, ctx, es_tutor),
                    "remitente": remitente,
                    "estadoEnvio": "pendiente",
                    "intentos": 0,
                    "creado": ahora,
                    "enviado": None,
                    "error": "",
                })
                encolados += 1
            except Exception as exc:
                # Clave duplicada: el aviso para este destino ya existe.
                if "duplicate" not in str(exc).lower() and "11000" not in str(exc):
                    raise
        return encolados
    except Exception:
        logger.exception("No se pudo encolar el aviso de inasistencia")
        return 0


def pendiente(del_estado=None):
    filtro = {"estadoEnvio": "pendiente"}
    if del_estado:
        filtro["estadoEnvio"] = del_estado
    return _mongo_db[COLECCION].find(filtro).sort("creado", 1)
