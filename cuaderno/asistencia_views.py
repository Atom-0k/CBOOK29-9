"""Módulo de ASISTENCIA del Cuaderno Digital.

Reutiliza las estructuras existentes (MongoDB 'cuaderno_db', roles y
asignaciones de auth.py, configuración y auditoría de admin_views.py).

Dos tipos de asistencia:
  * institucional  -> la registra el PRECEPTOR (por jornada/turno).
  * materia       -> la registran PROFESORES (en sus materias/cursos) y
                     PRECEPTORES (cuando corresponda según la normativa).

Reglas institucionales (configurables en 'config' / Admin → Configuración):
  * limite_inasistencias       (default 28)
  * porcentaje_min_asistencia  (default 75)
  * minutos_tolerancia_tardia  (default 20)

Cálculo de inasistencias (Decimal, sin errores de redondeo):
  * Presente         -> 0
  * Tarde <=20 min   -> 0,25
  * Tarde >20 min    -> se computa como ausente del turno
  * Ausente          -> 1,0 si el alumno tiene UN turno;
                        0,5 por turno si tiene doble turno / contraturno.
  * Justificada      -> 0 (no cuenta contra el límite).

Porcentaje por materia (cálculo entero para no depender de floats):
  clases dictadas (fechas con registro) vs. clases asistidas (Presente).
  Estado: cumple (>= min+5), cerca (< min+5 y >= min), no_cumple (< min).

Todo cambio de estado conserva trazabilidad en 'historial' de cada
registro y se registra en la colección 'auditoria'. Nunca se elimina la
in original al justificarla.
"""
import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal

from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .actas import lista_publica, obtener_acta, registrar_acta
from .notificaciones import encolar_inasistencia
from .pdf_acta import content_disposition, generar_acta_pdf, nombre_archivo
from .auth import (
    _mongo_db,
    alumno_de_curso,
    autenticar,
    can_acceder_alumno,
    cursos_materias_profesor,
    cursos_preceptor,
    get_config,
    get_roles,
    get_usuario_doc,
    log_accion,
)

ESTADOS_VALIDOS = {"Presente", "Ausente", "Tarde"}
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
logger = logging.getLogger(__name__)


def _resp(data, status=200):
    return JsonResponse(data, status=status)


def _nombre(doc):
    return f"{doc.get('Nombres', '')} {doc.get('Apellido', '')}".strip()


def _roles(gmail):
    doc = get_usuario_doc(gmail)
    return get_roles(doc) if doc else []


def _es_admin(gmail):
    return "Admin" in _roles(gmail)


def _preceptor_de_curso(gmail, curso):
    return "Preceptor" in _roles(gmail) and curso in cursos_preceptor(gmail)


def _profesor_de_materia(gmail, curso, materia):
    return "Profesor" in _roles(gmail) and (curso, materia) in cursos_materias_profesor(gmail)


def _puede_institucional(gmail, curso):
    """Institucional: preceptor del curso o admin."""
    return _es_admin(gmail) or _preceptor_de_curso(gmail, curso)


def _puede_materia(gmail, curso, materia):
    """Por materia: sólo quien dicta esa materia en ese curso (o el admin).

    OJO con el rol: ser preceptor del curso NO habilita a marcar cualquier
    materia. Antes `_puede_materia` daba acceso si el usuario era preceptor del
    curso, así que un preceptor podía pisar la asistencia de materias que no
    dicta (p. ej. el preceptor de 6B marcando Matemática, que es de otro
    profesor). La asistencia institucional del turno sigue siendo exclusiva del
    preceptor; la que va por materia es del docente de la materia.
    """
    if _es_admin(gmail):
        return True
    return _profesor_de_materia(gmail, curso, materia)


def _curso_existe(curso):
    return bool(_mongo_db["cursos"].find_one({"nombre": curso}))


# ---------------------------------------------------------------------------
# Configuración institucional de asistencia
# ---------------------------------------------------------------------------

def _config_asistencia():
    conf = get_config()

    def num(campo, default):
        try:
            v = float(conf.get(campo, default))
            return v if v > 0 else default
        except (TypeError, ValueError):
            return default

    return {
        "limite": num("limite_inasistencias", 28),
        "minimo": num("porcentaje_min_asistencia", 75),
        "tolerancia": int(num("minutos_tolerancia_tardia", 20)),
        "anio_lectivo": str(conf.get("anio_lectivo") or datetime.now().year),
    }


# ---------------------------------------------------------------------------
# Permisos y alumnos
# ---------------------------------------------------------------------------

def _cursos_preceptor_compat(gmail):
    """Compat wrapper: cursos de preceptor como set de nombres."""
    return set(cursos_preceptor(gmail))


def _cursos_materias_profesor_compat(gmail):
    """Compat wrapper: {(curso, materia)} del profesor como set."""
    return set(cursos_materias_profesor(gmail))


def _alumnos_curso(curso):
    """Alumnos activos (no dados de baja) de un curso."""
    if not curso:
        return []
    resultado = []
    for a in _mongo_db["usuarios"].find({"Curso": curso, "estado": {"$ne": "Baja"}}):
        if "Alumno" not in get_roles(a):
            continue
        resultado.append({
            "gmail": a.get("Gmail", ""),
            "nombre": _nombre(a) or a.get("Gmail", ""),
        })
    return resultado


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def _fecha_ok(fecha):
    return bool(fecha) and bool(_FECHA.match(fecha))


def _validar_fecha(fecha, permitir_futuro=False):
    try:
        f = datetime.strptime(fecha, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None, "Fecha inválida"
    if not permitir_futuro and f > date.today():
        return None, "No podés registrar asistencia de una fecha futura"
    return f.isoformat(), None


# ---------------------------------------------------------------------------
# Cálculos de inasistencia
# ---------------------------------------------------------------------------

def _cantidad_turnos(usuario_doc):
    """1 turno (mañana/tarde) o 2 turnos (doble turno / contraturno)."""
    turno = str((usuario_doc or {}).get("Turno") or "").strip().lower()
    if turno in ("doble", "doble turno", "contraturno"):
        return 2
    return 1


def _peso_ausente(usuario_doc):
    """Una ausencia pesa 1 falta (un solo turno) o 0,5 por turno
    (doble turno / contraturno)."""
    return Decimal("0.5") if _cantidad_turnos(usuario_doc) == 2 else Decimal("1")


def _peso_inasistencia(usuario_doc, estado, minutos_retraso, tolerancia):
    if estado == "Presente":
        return Decimal("0")
    if estado == "Tarde":
        try:
            m = int(minutos_retraso or 0)
        except (TypeError, ValueError):
            m = 0
        if m <= tolerancia:
            return Decimal("0.25")
        return _peso_ausente(usuario_doc)
    return _peso_ausente(usuario_doc)


def _esta_justificada(doc):
    j = doc.get("justificacion") or {}
    return j.get("estado") == "Justificada"


def _inasistencias_institucionales(gmail, anio_lectivo, tolerancia):
    """Suma de inasistencias institucionales del alumno en el año lectivo."""
    usuario_doc = get_usuario_doc(gmail)
    total = Decimal("0")
    for d in _mongo_db["asistencias"].find({
        "tipo": "institucional",
        "alumnoGmail": gmail,
        "anio_lectivo": anio_lectivo,
        "eliminada": {"$ne": True},
    }):
        if _esta_justificada(d):
            continue
        total += _peso_inasistencia(usuario_doc, d.get("estado"), d.get("minutosRetraso"), tolerancia)
    return total


def _estado_materia(asistidas, dictadas, minimo):
    """Estado de asistencia de un alumno en una materia, calculado con
    aritmética entera (sin errores de redondeo)."""
    if dictadas <= 0:
        return "sin_datos"
    if asistidas * 100 >= minimo * dictadas:
        if asistidas * 100 >= (minimo + 5) * dictadas:
            return "cumple"
        return "cerca"
    return "no_cumple"


def _requiere_intensificacion(asistidas, dictadas, minimo):
    return dictadas > 0 and asistidas * 100 < minimo * dictadas


def _resumen_por_materia(gmail, anio_lectivo, minimo):
    """Resumen del alumno: por cada materia, clases dictadas/asistidas,
    porcentaje y estado."""
    por = {}
    for d in _mongo_db["asistencias"].find({
        "tipo": "materia",
        "alumnoGmail": gmail,
        "anio_lectivo": anio_lectivo,
        "eliminada": {"$ne": True},
    }, {"materia": 1, "fecha": 1, "estado": 1}):
        materia = d.get("materia") or ""
        if not materia:
            continue
        m = por.setdefault(materia, {"fechas": set(), "asistidas": 0})
        m["fechas"].add(d.get("fecha", ""))
        if d.get("estado") == "Presente":
            m["asistidas"] += 1

    resultado = []
    for materia, m in por.items():
        dictadas = len(m["fechas"])
        asistidas = m["asistidas"]
        resultado.append({
            "materia": materia,
            "clases": dictadas,
            "asistidas": asistidas,
            "porcentaje": round(asistidas * 100.0 / dictadas, 1) if dictadas else None,
            "estado": _estado_materia(asistidas, dictadas, minimo),
            "requiere_intensificacion": _requiere_intensificacion(asistidas, dictadas, minimo),
        })
    resultado.sort(key=lambda x: x["materia"])
    return resultado


def _resumen_materia_curso(alumnos, curso, materia, anio_lectivo, minimo):
    """Resumen de TODOS los alumnos de un curso en una materia (para el
    profesor: ver el porcentaje de asistencia de sus alumnos)."""
    resultado = []
    for a in alumnos:
        fechas = set()
        asistidas = 0
        for d in _mongo_db["asistencias"].find({
            "tipo": "materia",
            "anio_lectivo": anio_lectivo,
            "curso": curso,
            "materia": materia,
            "alumnoGmail": a["gmail"],
            "eliminada": {"$ne": True},
        }, {"fecha": 1, "estado": 1}):
            fechas.add(d.get("fecha", ""))
            if d.get("estado") == "Presente":
                asistidas += 1
        dictadas = len(fechas)
        resultado.append({
            "gmail": a["gmail"],
            "nombre": a["nombre"],
            "clases": dictadas,
            "asistidas": asistidas,
            "porcentaje": round(asistidas * 100.0 / dictadas, 1) if dictadas else None,
            "estado": _estado_materia(asistidas, dictadas, minimo),
            "requiere_intensificacion": _requiere_intensificacion(asistidas, dictadas, minimo),
        })
    return resultado


def _historial_alumno(gmail, anio_lectivo):
    lista = []
    for d in _mongo_db["asistencias"].find({
        "alumnoGmail": gmail,
        "anio_lectivo": anio_lectivo,
        "eliminada": {"$ne": True},
    }).sort("fecha", -1):
        lista.append({
            "fecha": d.get("fecha"),
            "turno": d.get("turno") or "",
            "estado": d.get("estado") or "Presente",
            "tipo": d.get("tipo") or "institucional",
            "materia": d.get("materia") or "",
            "minutosRetraso": d.get("minutosRetraso"),
            "horaIngreso": d.get("horaIngreso") or "",
            "observacion": d.get("observacion") or "",
            "justificacion": d.get("justificacion") or None,
            "registradoPor": d.get("registradoPor") or "",
        })
    return lista


# ---------------------------------------------------------------------------
# Helpers para preceptor (alumnos con estado existente)
# ---------------------------------------------------------------------------

def _filtro_materia(curso, fecha, materia, anio_lectivo=None):
    filtro = {
        "curso": curso,
        "fecha": fecha,
        "tipo": "materia",
        "materia": materia,
        "eliminada": {"$ne": True},
    }
    if anio_lectivo:
        filtro["anio_lectivo"] = str(anio_lectivo)
    return filtro


def _filtro_institucional(curso, fecha, turno):
    return {
        "curso": curso,
        "fecha": fecha,
        "tipo": "institucional",
        "turno": turno,
        "eliminada": {"$ne": True},
    }


def _cargar_estado_por_curso(curso, filtro):
    """Mapa gmail -> doc de asistencia para los alumnos activos del curso."""
    por_gmail = {}
    for reg in _mongo_db["asistencias"].find(filtro):
        por_gmail[reg.get("alumnoGmail")] = reg
    return por_gmail


def _alumnos_con_estado(curso, filtro):
    por_gmail = _cargar_estado_por_curso(curso, filtro)
    lista = []
    for u in _alumnos_curso(curso):
        gmail = u["gmail"]
        reg = por_gmail.get(gmail)
        lista.append({
            "gmail": gmail,
            "nombre": u["nombre"],
            "estado": reg.get("estado") if reg else None,
            "minutosRetraso": reg.get("minutosRetraso") if reg else None,
            "horaIngreso": (reg.get("horaIngreso") or "") if reg else "",
            "observacion": (reg.get("observacion") or "") if reg else "",
        })
    return lista


# ---------------------------------------------------------------------------
# Lectura / escritura de registros
# ---------------------------------------------------------------------------

def _doc_institucional(gmail, anio_lectivo, curso, fecha, turno):
    return _mongo_db["asistencias"].find_one({
        "anio_lectivo": anio_lectivo,
        "tipo": "institucional",
        "curso": curso,
        "fecha": fecha,
        "turno": turno,
        "alumnoGmail": gmail,
        "eliminada": {"$ne": True},
    })


def _doc_materia(gmail, anio_lectivo, curso, materia, fecha):
    return _mongo_db["asistencias"].find_one({
        "anio_lectivo": anio_lectivo,
        "tipo": "materia",
        "curso": curso,
        "materia": materia,
        "fecha": fecha,
        "alumnoGmail": gmail,
        "eliminada": {"$ne": True},
    })


def _registro_vista(alumno, doc):
    r = {
        "gmail": alumno["gmail"],
        "nombre": alumno["nombre"],
        "estado": None,
        "minutosRetraso": None,
        "horaIngreso": None,
        "observacion": "",
        "justificacion": None,
    }
    if doc:
        r["estado"] = doc.get("estado")
        r["minutosRetraso"] = doc.get("minutosRetraso")
        r["horaIngreso"] = doc.get("horaIngreso")
        r["observacion"] = doc.get("observacion") or ""
        r["justificacion"] = doc.get("justificacion") or None
    return r


def _base_registro(gmail_sesion, usuario_doc):
    """Dict base con quién registró (rol definido por el SERVIDOR)."""
    return {
        "registradoPor": _nombre(usuario_doc) or gmail_sesion,
        "registradoPorGmail": gmail_sesion,
        "registradoPorRol": " / ".join(get_roles(usuario_doc)),
    }


def _guardar_asistencia(request, gmail_sesion, usuario_doc, registros, base_filtro):
    """Upsert de los registros de asistencia.

    Devuelve (procesados, avisados): cuántos registros se guardaron y cuántos
    avisos de inasistencia quedaron encolados. Preserva la justificación y el
    historial.
    """
    ahora = datetime.now().isoformat()
    nombre = _nombre(usuario_doc) or gmail_sesion
    rol = " / ".join(get_roles(usuario_doc)) if get_roles(usuario_doc) else ""
    procesados = 0
    # (registro ya persistido, estado anterior) de los que cambiaron.
    nuevos = []

    for r in registros or []:
        gmail = (r.get("gmail") or "").strip()
        estado = (r.get("estado") or "").strip()
        if not gmail or estado not in ("Presente", "Ausente", "Tarde"):
            continue
        if not alumno_de_curso(gmail, base_filtro.get("curso", "")):
            continue
        filtro = dict(base_filtro)
        filtro["alumnoGmail"] = gmail

        cambios = {
            "estado": estado,
            "minutosRetraso": r.get("minutosRetraso"),
            "horaIngreso": (r.get("horaIngreso") or "").strip() or None,
            "observacion": (r.get("observacion") or "").strip(),
            "registradoPor": nombre,
            "registradoPorGmail": gmail_sesion,
            "registradoPorRol": rol,
            "modificado": ahora,
        }

        existente = _mongo_db["asistencias"].find_one(filtro)
        if not existente:
            doc = dict(filtro)
            doc.update(cambios)
            doc["creado"] = ahora
            doc["justificacion"] = None
            doc["eliminada"] = False
            doc["historial"] = [{
                "fecha": ahora,
                "usuario": nombre,
                "rol": rol,
                "estadoAnterior": None,
                "estadoNuevo": estado,
            }]
            _mongo_db["asistencias"].insert_one(doc)
            nuevos.append((dict(doc), None))
        else:
            if existente.get("estado") != estado:
                historial = list(existente.get("historial") or [])
                historial.append({
                    "fecha": ahora,
                    "usuario": nombre,
                    "rol": rol,
                    "estadoAnterior": existente.get("estado"),
                    "estadoNuevo": estado,
                })
                cambios["historial"] = historial
                cambios["justificacion"] = existente.get("justificacion")
            _mongo_db["asistencias"].update_one({"_id": existente["_id"]}, {"$set": cambios})
            # Sólo se avisa si el estado cambió de verdad: re-guardar la misma
            # lista no debe generar correos nuevos.
            if existente.get("estado") != estado:
                nuevos.append(({**existente, **cambios}, existente.get("estado")))
        procesados += 1

    # Los avisos se encolan al final, fuera del loop, para que un problema de
    # correo no deje la lista a medio guardar.
    avisados = 0
    for registro, _ in nuevos:
        avisados += _encolar_seguro(registro)
    return procesados, avisados


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@require_GET
def api_asistencia_config(request):
    gmail, err = autenticar(request)
    if err:
        return err
    return _resp({"config": _config_asistencia()})


@require_GET
def api_asistencia_alumno(request):
    """Resumen del alumno: inasistencias institucionales (límite/restan),
    porcentajes por materia (75%) e historial completo."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err
    usuario_doc = get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return _resp({"error": "No autorizado"}, 403)

    solicitado = (request.GET.get("gmail") or "").strip() or gmail_sesion
    roles = get_roles(usuario_doc)
    objetivo = usuario_doc

    if solicitado != gmail_sesion:
        alumno_doc = get_usuario_doc(solicitado)
        if not alumno_doc:
            return _resp({"error": "Alumno no encontrado"}, 404)
        if not can_acceder_alumno(gmail_sesion, solicitado, alumno_doc.get("Curso") or ""):
            return _resp({"error": "No autorizado"}, 403)
        objetivo = alumno_doc

    conf = _config_asistencia()
    total = _inasistencias_institucionales(solicitado, conf["anio_lectivo"], conf["tolerancia"])
    limite = Decimal(str(conf["limite"]))
    supero = total > limite
    restan = float((limite - total).quantize(Decimal("0.1"))) if not supero else 0

    return _resp({
        "config": conf,
        "alumnoGmail": solicitado,
        "nombre": _nombre(objetivo),
        "turno": objetivo.get("Turno") or "",
        "inasistencias": float(total),
        "limite": conf["limite"],
        "supero_limite": supero,
        "restan": restan,
        "por_materia": _resumen_por_materia(solicitado, conf["anio_lectivo"], conf["minimo"]),
        "historial": _historial_alumno(solicitado, conf["anio_lectivo"]),
    })


@require_GET
def api_asistencia_preceptor(request):
    """GET: carga los alumnos con su estado para preceptor (institucional o por materia)."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    curso = (request.GET.get("curso") or "").strip()
    fecha = (request.GET.get("fecha") or "").strip()
    tipo = (request.GET.get("tipo") or "").strip().lower()

    if not curso or not _fecha_ok(fecha) or tipo not in ("institucional", "materia"):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not _curso_existe(curso):
        return _resp({"error": "Curso no encontrado"}, 404)

    anio = _config_asistencia()["anio_lectivo"]
    alumnos = _alumnos_curso(curso)
    materia_val = None
    turno_val = None

    if tipo == "institucional":
        if not _puede_institucional(gmail_sesion, curso):
            return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)
        turno_val = (request.GET.get("turno") or "").strip().lower()
        if turno_val not in ("mañana", "tarde", "contraturno", "noche"):
            turno_val = "mañana"
        registros = [
            _registro_vista(a, _doc_institucional(a["gmail"], anio, curso, fecha, turno_val))
            for a in alumnos
        ]
    else:
        materia_val = (request.GET.get("materia") or "").strip()
        if not materia_val:
            return _resp({"error": "Falta la materia"}, 400)
        if not _puede_materia(gmail_sesion, curso, materia_val):
            return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)
        registros = [
            _registro_vista(a, _doc_materia(a["gmail"], anio, curso, materia_val, fecha))
            for a in alumnos
        ]

    return _resp({
        "tipo": tipo,
        "curso": curso,
        "fecha": fecha,
        "turno": turno_val,
        "materia": materia_val,
        "alumnos": registros,
    })


@require_POST
def api_asistencia_preceptor_guardar(request):
    """POST: guarda la asistencia institucional (o por materia) de un curso."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err
    usuario_doc = get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return _resp({"error": "No autorizado"}, 403)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    curso = (data.get("curso") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    tipo = (data.get("tipo") or "institucional").strip().lower()
    registros = data.get("registros")

    if not curso or not _fecha_ok(fecha) or tipo not in ("institucional", "materia"):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not isinstance(registros, list):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not _curso_existe(curso):
        return _resp({"error": "Curso no encontrado"}, 404)

    anio = _config_asistencia()["anio_lectivo"]
    base = {"anio_lectivo": anio, "tipo": tipo, "curso": curso, "fecha": fecha}

    if tipo == "institucional":
        if not _puede_institucional(gmail_sesion, curso):
            return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)
        turno = (data.get("turno") or "").strip().lower()
        if turno not in ("mañana", "tarde", "contraturno", "noche"):
            turno = "mañana"
        base["turno"] = turno
        detalle = f"Asistencia institucional {curso} {fecha} {turno}"
    else:
        materia = (data.get("materia") or "").strip()
        if not materia:
            return _resp({"error": "Falta la materia"}, 400)
        if not _puede_materia(gmail_sesion, curso, materia):
            return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)
        base["materia"] = materia
        detalle = f"Asistencia por materia {curso} {materia} {fecha}"

    procesados, avisados = _guardar_asistencia(request, gmail_sesion, usuario_doc, registros, base)
    acta = _registrar_acta_segura(
        request, gmail_sesion, usuario_doc,
        tipo=tipo, curso=curso, fecha=fecha,
        turno=base.get("turno"), materia=base.get("materia"),
    )
    log_accion(request, "Guardar asistencia", f"{detalle}: {procesados} registros")
    return _resp({
        "ok": True,
        "cambios": procesados,
        "acta": acta,
        "notificaciones": avisados,
    })


@require_GET
def api_asistencia_profesor(request):
    """GET: alumnos + resumen de asistencia por materia de un curso."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    curso = (request.GET.get("curso") or "").strip()
    materia = (request.GET.get("materia") or "").strip()
    fecha = (request.GET.get("fecha") or "").strip()

    if not curso or not materia or not _fecha_ok(fecha):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not _curso_existe(curso):
        return _resp({"error": "Curso no encontrado"}, 404)
    if not _puede_materia(gmail_sesion, curso, materia):
        return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)

    conf = _config_asistencia()
    anio = conf["anio_lectivo"]
    alumnos = _alumnos_curso(curso)
    registros = [
        _registro_vista(a, _doc_materia(a["gmail"], anio, curso, materia, fecha))
        for a in alumnos
    ]
    return _resp({
        "tipo": "materia",
        "curso": curso,
        "materia": materia,
        "fecha": fecha,
        "alumnos": registros,
        "resumen": _resumen_materia_curso(alumnos, curso, materia, anio, conf["minimo"]),
    })


def _encolar_seguro(registro):
    """Encola los avisos de inasistencia sin arriesgar el guardado.

    El módulo de notificaciones ya absorbe sus propios errores, pero el
    guardado de la asistencia no puede depender de eso: si el aviso falla,
    la lista tiene que quedar guardada igual.
    """
    try:
        return encolar_inasistencia(registro)
    except Exception as exc:  # pragma: no cover - red de seguridad
        logger.exception("No se pudo encolar el aviso de inasistencia: %s", exc)
        return 0


def _registrar_acta_segura(*args, **kwargs):
    """Genera el acta sin arriesgar el guardado de la asistencia.

    Si el snapshot falla, la asistencia ya quedó persistida y el docente no
    debe ver un error por algo que es accesorio. Se avisa por log.
    """
    try:
        return registrar_acta(*args, **kwargs)
    except Exception as exc:  # pragma: no cover - red de seguridad
        logger.exception("No se pudo registrar el acta: %s", exc)
        return None


@require_POST
def api_asistencia_profesor_guardar(request):
    """POST: guarda la asistencia por materia."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err
    usuario_doc = get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return _resp({"error": "No autorizado"}, 403)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    curso = (data.get("curso") or "").strip()
    materia = (data.get("materia") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    registros = data.get("registros")

    if not curso or not materia or not _fecha_ok(fecha):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not isinstance(registros, list):
        return _resp({"error": "Parámetros inválidos"}, 400)
    if not _curso_existe(curso):
        return _resp({"error": "Curso no encontrado"}, 404)
    if not _puede_materia(gmail_sesion, curso, materia):
        return _resp({"error": "No tenés autorización para la asistencia de este curso."}, 403)

    anio_lectivo = _config_asistencia()["anio_lectivo"]
    procesados, avisados = _guardar_asistencia(
        request, gmail_sesion, usuario_doc, registros,
        _filtro_materia(curso, fecha, materia, anio_lectivo),
    )
    acta = _registrar_acta_segura(
        request, gmail_sesion, usuario_doc,
        tipo="materia", curso=curso, fecha=fecha, materia=materia,
    )
    log_accion(
        request, "Guardar asistencia",
        f"Asistencia por materia {curso} {materia} {fecha}: {procesados} registros",
        usuario=gmail_sesion,
    )
    return _resp({
        "ok": True,
        "cambios": procesados,
        "acta": acta,
        "notificaciones": avisados,
    })


@require_POST
def api_asistencia_justificar(request):
    """POST: registra una justificación de inasistencia.

    Un alumno puede pedir su propia justificación, pero nunca auto-aprobarla:
    salvo que el solicitante sea Admin o Preceptor del curso del alumno, se
    fuerza estado 'Pendiente' y se descarta el certificado enviado.
    """
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    gmail = (data.get("gmail") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    motivo = (data.get("motivo") or "").strip()
    fecha_inasistencia = (data.get("fechaInasistencia") or "").strip()
    fecha_presentacion = (data.get("fechaPresentacion") or "").strip()
    tipo_justificacion = (data.get("tipoJustificacion") or "").strip()
    turno = (data.get("turno") or "").strip().lower()

    if not gmail or not _fecha_ok(fecha):
        return _resp({"error": "Faltan datos de la justificación"}, 400)
    if turno and turno not in ("mañana", "tarde", "contraturno", "noche"):
        return _resp({"error": "Turno inválido"}, 400)

    alumno_doc = get_usuario_doc(gmail)
    if not alumno_doc:
        return _resp({"error": "Alumno no encontrado"}, 404)
    curso_alumno = alumno_doc.get("Curso") or ""
    if gmail != gmail_sesion and not can_acceder_alumno(gmail_sesion, gmail, curso_alumno):
        return _resp({"error": "No tenés autorización para justificar a este alumno."}, 403)

    usuario_doc = get_usuario_doc(gmail_sesion)
    puede_aprobar = _es_admin(gmail_sesion) or _preceptor_de_curso(gmail_sesion, curso_alumno)
    estado_justificacion = data.get("estado") or "Pendiente"
    certificado = data.get("certificado") or ""
    if not puede_aprobar:
        estado_justificacion = "Pendiente"
        certificado = ""

    justificacion = {
        "estado": estado_justificacion,
        "tipo": tipo_justificacion,
        "motivo": motivo,
        "fechaPresentacion": fecha_presentacion,
        "fechaInasistencia": fecha_inasistencia,
        "observacion": (data.get("observacion") or "").strip(),
        "certificado": certificado,
        "fecha": datetime.now().isoformat(),
        "solicitante": _nombre(usuario_doc) or gmail_sesion,
        "solicitanteGmail": gmail_sesion,
    }

    match = {"alumnoGmail": gmail, "fecha": fecha, "eliminada": {"$ne": True}}
    if turno:
        match["turno"] = turno
    ahora = datetime.now().isoformat()
    base = _base_registro(gmail_sesion, usuario_doc)

    existentes = list(_mongo_db["asistencias"].find(match))
    if not existentes:
        _mongo_db["asistencias"].insert_one({
            "curso": curso_alumno,
            "materia": None,
            "tipo": "institucional",
            "turno": turno or None,
            "fecha": fecha,
            "alumnoGmail": gmail,
            "estado": "Ausente",
            "minutosRetraso": None,
            "horaIngreso": "",
            "observacion": "",
            "anio_lectivo": str(get_config().get("anio_lectivo") or datetime.now().year),
            "registradoPor": base["registradoPor"],
            "registradoPorGmail": base["registradoPorGmail"],
            "registradoPorRol": base["registradoPorRol"],
            "creado": ahora,
            "modificado": ahora,
            "justificacion": justificacion,
            "eliminada": False,
            "historial": [],
        })
    else:
        _mongo_db["asistencias"].update_many(
            match,
            {"$set": {"justificacion": justificacion, "modificado": ahora}},
        )

    log_accion(request, "Justificación registrada", f"{gmail} -> {fecha}", usuario=gmail_sesion)
    return _resp({"ok": True})


# ---------------------------------------------------------------------------
# Actas de asistencia: listado, detalle y descarga en PDF
# ---------------------------------------------------------------------------

def _puede_ver_acta(gmail, acta):
    """Sólo quien podía tomar esa lista puede ver el acta.

    Los alumnos no acceden a las actas: son documentos internos del cuerpo
    docente. Un profesor sólo alcanza las actas por materia de las que es
    titular, no las institucionales de todo el curso.
    """
    if _es_admin(gmail):
        return True
    curso = acta.get("curso")
    if _preceptor_de_curso(gmail, curso):
        return True
    if acta.get("tipo") == "materia":
        return _profesor_de_materia(gmail, curso, acta.get("materia"))
    return False


def _acceso_actas_permitido(gmail):
    """El usuario tiene algún rol que le permite ver actas.

    Se comprueba ANTES de tocar la base a propósito: si se buscara el acta
    primero, un alumno podría recorrer clases y usar los estados 404/200 para
    deducir qué cursos tienen lista archivada. Con esta compuerta, quien nunca
    puede ver un acta recibe siempre 403, exista o no.
    """
    if _es_admin(gmail):
        return True
    roles = _roles(gmail)
    return "Alumno" not in roles and bool({"Preceptor", "Profesor"} & set(roles))


def _intento(valor, default, minimo, maximo):
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return default
    return max(minimo, min(n, maximo))


@require_GET
def api_actas_lista(request):
    """GET: actas de asistencia visibles para el usuario, de más reciente a antigua."""
    gmail_sesion, err = autenticar(request)
    if err:
        return err
    if not _acceso_actas_permitido(gmail_sesion):
        return _resp({"error": "No autorizado"}, 403)

    filtro = {}
    curso = (request.GET.get("curso") or "").strip()
    tipo = (request.GET.get("tipo") or "").strip().lower()
    materia = (request.GET.get("materia") or "").strip()
    turno = (request.GET.get("turno") or "").strip().lower()
    desde = (request.GET.get("desde") or "").strip()
    hasta = (request.GET.get("hasta") or "").strip()

    if curso:
        filtro["curso"] = curso
    if tipo in ("institucional", "materia"):
        filtro["tipo"] = tipo
    if materia:
        filtro["materia"] = materia
    if turno:
        filtro["turno"] = turno
    if _fecha_ok(desde):
        filtro["fecha"] = {"$gte": desde}
    if _fecha_ok(hasta):
        filtro.setdefault("fecha", {})["$lte"] = hasta

    limite = _intento(request.GET.get("limite"), 100, 1, 500)
    # Se sobre-consulta y se filtra por permiso: el filtro por curso no alcanza
    # para separar 'profesor de una materia' de 'preceptor del curso'.
    # `limit` va aparte de `sort` porque pymongo 3.x no lo acepta como argumento.
    sobreconsulta = limite if _es_admin(gmail_sesion) else limite * 5
    candidatas = _mongo_db["asistencia_actas"].find(filtro).sort(
        [("fecha", -1), ("curso", 1), ("creado", -1)]
    ).limit(sobreconsulta)
    visibles = [a for a in candidatas if _puede_ver_acta(gmail_sesion, a)][:limite]
    return _resp({"ok": True, "total": len(visibles), "actas": lista_publica(visibles)})


def _acta_autorizada(request, clave):
    """Devuelve (acta, error). Devuelve el acta sólo si el usuario puede verla."""
    gmail_sesion, err = autenticar(request)
    if err:
        return None, err
    clave = (clave or "").strip()
    if not clave:
        return None, _resp({"error": "Falta el identificador del acta"}, 400)
    # La compuerta de rol va antes del lookup (ver _acceso_actas_permitido).
    if not _acceso_actas_permitido(gmail_sesion):
        return None, _resp({"error": "No autorizado"}, 403)
    acta = obtener_acta(clave)
    if not acta or not _puede_ver_acta(gmail_sesion, acta):
        # Mismo 404 para "no existe" y para "no te corresponde": si se
        # distinguieran, un preceptor podría ir probando fechas y cursos para
        # deducir en qué clases se archivaron listas.
        return None, _resp({"error": "Acta no encontrada"}, 404)
    return (acta, gmail_sesion), None


@require_GET
def api_actas_detalle(request):
    """GET: acta completa (registro por alumno) para revisarla en pantalla."""
    encontrado, err = _acta_autorizada(request, request.GET.get("clave"))
    if err:
        return err
    acta, gmail_sesion = encontrado
    return _resp({
        "ok": True,
        "acta": {
            **{k: v for k, v in acta.items() if k != "_id"},
            "revisiones": list(acta.get("revisiones") or []),
        },
    })


@require_GET
def api_actas_pdf(request):
    """GET: descarga el acta en PDF.

    El PDF se arma desde el acta congelada y lleva la hora de impresión, de
    modo que reimprimir deja constancia de cuándo se consultó.
    """
    encontrado, err = _acta_autorizada(request, request.GET.get("clave"))
    if err:
        return err
    acta, gmail_sesion = encontrado

    try:
        contenido = generar_acta_pdf(acta)
    except Exception:
        log_accion(request, "Acta PDF error", f"clave={acta.get('clave')}", usuario=gmail_sesion)
        return _resp({"error": "No se pudo generar el PDF"}, 500)

    archivo = nombre_archivo(acta)
    log_accion(request, "Descarga acta PDF", f"{archivo} (rev. {acta.get('version', 1)})",
               usuario=gmail_sesion)
    respuesta = HttpResponse(contenido, content_type="application/pdf")
    respuesta["Content-Disposition"] = content_disposition(archivo)
    respuesta["Content-Length"] = str(len(contenido))
    respuesta["Cache-Control"] = "no-store"
    return respuesta
