"""Helpers de autenticación, autorización y anti-abuso.

Centraliza la lógica de roles y permisos para que el backend (y no los
botones del frontend) sea la única fuente de verdad de seguridad.
"""
import unicodedata
from datetime import datetime, timedelta

import bcrypt
from bson import ObjectId
from django.http import JsonResponse

from config import db as db_conf

_mongo_db = db_conf.get_db()


# ---------------------------------------------------------------------------
# Acceso a datos
# ---------------------------------------------------------------------------

def get_usuario_doc(gmail):
    """Documento crudo de Mongo del usuario (con su _id real)."""
    return _mongo_db["usuarios"].find_one({"Gmail": gmail})


def get_roles(usuario_doc):
    """Siempre una LISTA de roles (texto simple o array en Mongo)."""
    rol_crudo = usuario_doc.get("Rol") if usuario_doc else None
    if not rol_crudo:
        return ["Alumno"]
    if isinstance(rol_crudo, list):
        return [str(r).strip().capitalize() for r in rol_crudo if r] or ["Alumno"]
    return [str(rol_crudo).strip().capitalize()]


def get_asignaciones(usuario_mongo_id):
    """Para un profesor: [{_id, curso, materia}]. Para preceptor: [{_id, curso, materia: None}]."""
    if not usuario_mongo_id:
        return []
    asignaciones = list(_mongo_db["asignaciones"].find({"usuario_id": usuario_mongo_id}))
    resultado = []
    for a in asignaciones:
        curso_doc = _mongo_db["cursos"].find_one({"_id": a.get("curso_id")})
        curso_nombre = curso_doc["nombre"] if curso_doc else ""
        resultado.append({
            "_id": str(a["_id"]),
            "curso": curso_nombre,
            "materia": a.get("materia"),
        })
    return resultado


def cursos_preceptor(gmail):
    """Cursos en los que el preceptor tiene asignación SIN materia."""
    doc = get_usuario_doc(gmail)
    if not doc:
        return set()
    return {a["curso"] for a in get_asignaciones(doc["_id"]) if not a.get("materia")}


def cursos_profesor(gmail):
    """Cursos en los que el profesor dicta al menos una materia."""
    doc = get_usuario_doc(gmail)
    if not doc:
        return set()
    return {a["curso"] for a in get_asignaciones(doc["_id"]) if a.get("materia")}


def cursos_materias_profesor(gmail):
    """Conjunto (curso, materia) que dicta el profesor."""
    doc = get_usuario_doc(gmail)
    if not doc:
        return set()
    return {(a["curso"], a["materia"]) for a in get_asignaciones(doc["_id"]) if a.get("materia")}


def puede_acceder_alumnos_curso(gmail, curso):
    """Autorización centralizada (OR de permisos por rol) para consultar
    los alumnos de un curso.

    Reglas:
      * Admin -> acceso de administrador.
      * Preceptor -> si tiene asignación SIN materia en ese curso.
      * Profesor -> si está asignado como docente a ESE curso (alguna materia).

    Un usuario con profesor+preceptor conserva los permisos de ambos: basta
    que UNO de sus roles tenga asignación real sobre el curso. Tener el rol
    "Profesor" o "Preceptor" NO alcanza por sí solo: se exige asignación real.
    """
    if not curso:
        return False
    doc = get_usuario_doc(gmail)
    if not doc:
        return False
    roles = get_roles(doc)
    if "Admin" in roles:
        return True
    if "Preceptor" in roles and curso in cursos_preceptor(gmail):
        return True
    if "Profesor" in roles and curso in cursos_profesor(gmail):
        return True
    return False


def puede_acceder_asignacion(gmail, asignacion_id):
    """Verifica que el usuario posea la asignación identificada por asignacion_id.

    Devuelve (True, asignacion_dict) si la asignación pertenece al usuario,
    o (False, None) si no.
    """
    if not gmail or not asignacion_id:
        return False, None
    try:
        oid = ObjectId(asignacion_id)
    except Exception:
        return False, None
    doc = get_usuario_doc(gmail)
    if not doc:
        return False, None
    a = _mongo_db["asignaciones"].find_one({"_id": oid, "usuario_id": doc["_id"]})
    if not a:
        return False, None
    curso_doc = _mongo_db["cursos"].find_one({"_id": a.get("curso_id")})
    curso_nombre = curso_doc["nombre"] if curso_doc else ""
    return True, {
        "_id": str(a["_id"]),
        "curso": curso_nombre,
        "materia": a.get("materia"),
    }


# ---------------------------------------------------------------------------
# Autenticación
# ---------------------------------------------------------------------------

def autenticar(request):
    """Devuelve (gmail, None) o (None, JsonResponse de error)."""
    gmail = request.session.get("usuario_gmail")
    if not gmail:
        return None, JsonResponse({"error": "No autenticado"}, status=401)
    return gmail, None


def es_admin(gmail):
    doc = get_usuario_doc(gmail)
    return bool(doc and "Admin" in get_roles(doc))


def es_staff(gmail):
    doc = get_usuario_doc(gmail)
    return bool(doc and any(r in ("Profesor", "Preceptor", "Admin") for r in get_roles(doc)))


def can_acceder_alumno(gmail_sesion, alumno_gmail, curso, materia=""):
    """Determina si el usuario logueado puede consultar datos de un alumno.

    Reglas:
      * el propio alumno (su cuenta);
      * Admin;
      * Preceptor del curso del alumno;
      * Profesor que dicta (curso, materia).
    """
    if not alumno_gmail or gmail_sesion == alumno_gmail:
        return True
    roles = get_roles(get_usuario_doc(gmail_sesion))
    if "Admin" in roles:
        return True
    if "Preceptor" in roles and curso in cursos_preceptor(gmail_sesion):
        return True
    if "Profesor" in roles and (curso, materia) in cursos_materias_profesor(gmail_sesion):
        return True
    return False


def alumno_de_curso(alumno_gmail, curso):
    """Verifica que el gmail pertenezca a un alumno activo de ese curso."""
    if not alumno_gmail or not curso:
        return False
    doc = _mongo_db["usuarios"].find_one({"Gmail": alumno_gmail, "Curso": curso})
    if not doc or (doc.get("estado") == "Baja"):
        return False
    return "Alumno" in get_roles(doc)


def nota_corresponde_a(gmail_sesion, nota, usuario_doc):
    """¿La nota es de este alumno? (para confirmarla o responderla)

    Centraliza la regla que usan la confirmación por PIN y las respuestas, para
    que las dos no puedan divergir y dejar una vía libre.

    La nota puede ser: directa (AlumnoGmail == su gmail), a un grupo (`alumnos`
    lo incluye) o a TODO el curso (sin AlumnoGmail y sin lista, y el curso del
    alumno coincide). Si la nota trae lista `alumnos`, esa lista manda: sin
    este chequeo un alumno del curso podría firmar una nota dirigida a sus
    compañeros.
    """
    if not gmail_sesion or not nota or not usuario_doc:
        return False
    grupo = nota.get("alumnos") or []
    return (
        nota.get("AlumnoGmail") == gmail_sesion
        or gmail_sesion in grupo
        or (
            not nota.get("AlumnoGmail")
            and not grupo
            and nota.get("Curso") == usuario_doc.get("Curso")
        )
    )


# ---------------------------------------------------------------------------
# Contraseñas
# ---------------------------------------------------------------------------

def validar_password(password):
    """Política de contraseñas. Devuelve (ok, error)."""
    password = password or ""
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres."
    if password.isdigit():
        return False, "La contraseña no puede ser solo números."
    if password.strip().lower() in ("password", "12345678", "contrasena", "contraseña"):
        return False, "La contraseña elegida es muy débil."
    return True, None


# Hash bcrypt de referencia para igualar el tiempo de verificación cuando el
# usuario no existe (evita enumeración por timing). NO es una credencial real.
DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt()).decode("utf-8")


def verificar_contrasena(password, password_hash):
    """Verifica una contraseña contra su hash bcrypt (o dummy si no hay hash)."""
    try:
        if not password_hash:
            bcrypt.checkpw(password.encode("utf-8"), DUMMY_HASH.encode("utf-8"))
            return False
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        bcrypt.checkpw(password.encode("utf-8"), DUMMY_HASH.encode("utf-8"))
        return False


def verificar_pin(pin, pin_hash):
    """Verifica un PIN contra su hash bcrypt. NO acepta texto plano."""
    if not pin_hash or not str(pin_hash).startswith("$2"):
        bcrypt.checkpw(pin.encode("utf-8"), DUMMY_HASH.encode("utf-8"))
        return False
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), str(pin_hash).encode("utf-8"))
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Anti-abuso (rate limiting por IP/cuenta)
# ---------------------------------------------------------------------------

def cliente_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _limpiar_ventana(clave, ventana):
    _mongo_db["intentos_login"].delete_many(
        {"clave": clave, "fecha": {"$lt": datetime.now() - timedelta(seconds=ventana)}}
    )


def _contar(clave, ventana):
    _limpiar_ventana(clave, ventana)
    return _mongo_db["intentos_login"].count_documents(
        {"clave": clave, "fecha": {"$gte": datetime.now() - timedelta(seconds=ventana)}}
    )


def rate_limitar(clave, limite, ventana, registrar=True):
    """Devuelve (permitido, intentos_en_ventana). Si registrar, registra el intento."""
    n = _contar(clave, ventana)
    permitido = n < limite
    if registrar and permitido:
        _mongo_db["intentos_login"].insert_one({"clave": clave, "fecha": datetime.now()})
    return permitido, n


def limpiar_intentos(clave):
    _mongo_db["intentos_login"].delete_many({"clave": clave})


def login_limite_ip(request):
    ip = cliente_ip(request)
    return rate_limitar(f"login_ip:{ip}", 30, 3600)


def pin_limite_ip(request):
    ip = cliente_ip(request)
    return rate_limitar(f"pin_ip:{ip}", 30, 3600)


# ---------------------------------------------------------------------------
# Auditoría
# ---------------------------------------------------------------------------

def _parse_ua(ua):
    ua = ua or ""
    if "Edg/" in ua:
        browser = "Edge"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    elif "OPR/" in ua:
        browser = "Opera"
    else:
        browser = "Desconocido"
    if "Windows" in ua:
        so = "Windows"
    elif "Android" in ua:
        so = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        so = "iOS"
    elif "Mac OS X" in ua:
        so = "macOS"
    elif "Linux" in ua:
        so = "Linux"
    else:
        so = "Desconocido"
    return browser, so


def log_accion(request, accion, detalle="", usuario=None):
    """Registra un evento de auditoría. NUNCA guarda PINs ni contraseñas."""
    browser, so = _parse_ua(request.headers.get("User-Agent", "") if request else "")
    _mongo_db["auditoria"].insert_one({
        "Fecha": datetime.now().isoformat(),
        "Usuario": usuario or (request.session.get("usuario_gmail", "") if request else ""),
        "Accion": accion,
        "Detalle": detalle,
        "IP": cliente_ip(request) if request else "",
        "Navegador": browser,
        "SO": so,
    })


def normalizar(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    return "".join(c for c in texto if not unicodedata.combining(c)).strip()


def _id_seguro(valor):
    """Convierte un id a ObjectId o devuelve None si es inválido."""
    if not valor:
        return None
    try:
        return ObjectId(valor)
    except Exception:
        return None


def get_config():
    doc = _mongo_db["config"].find_one({"_id": "config"})
    if not doc:
        return {
            "nombre_escuela": "Escuela de Educación Técnica",
            "anio_lectivo": str(datetime.now().year),
            "duracion_sesion_min": 480,
            "long_min_contrasena": 8,
            "long_pin": 8,
            "modo_mantenimiento": False,
            "notificaciones_email": False,
            "limite_inasistencias": 28,
            "porcentaje_min_asistencia": 75,
            "minutos_tolerancia_tardia": 20,
        }
    return doc
