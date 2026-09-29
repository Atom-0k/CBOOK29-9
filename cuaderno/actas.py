"""Actas de asistencia: snapshot congelado de una lista tomada.

Cada vez que un preceptor o un profesor guarda la asistencia, se genera (o
actualiza) el acta de esa clase. El acta guarda los registros YA resueltos
y CONGELADOS, con estos objetivos:

  * que quede como prueba aunque después se vuelva a corregir la asistencia;
  * que se pueda reabrir y descargar como PDF en cualquier momento;
  * que se sepa quién la tomó, cuándo, y cuántas veces se revisó después.

Colección: `asistencia_actas`, con índice único sobre `clave`, donde

    clave = anio_lectivo | tipo | curso | fecha | turno | materia

Para `tipo="institucional"` manda el turno y la materia queda vacía; para
`tipo="materia"` al revés.

El snapshot se arma LEYENDO de Mongo, nunca desde el cuerpo del POST: el
guardado descarta en silencio los alumnos sin marcar y los que no pertenecen
al curso, así que el payload no refleja lo que quedó persistido.
"""
from datetime import datetime

from .auth import _mongo_db, get_config, get_roles, normalizar

COLECCION = "asistencia_actas"

# Máximo de revisiones guardadas por acta (el historial se recorta, no crece sin límite).
MAX_REVISIONES = 50

_indice_creado = False


def _asegurar_indice():
    """Crea el índice único de `clave` una sola vez por proceso."""
    global _indice_creado
    if _indice_creado:
        return
    try:
        _mongo_db[COLECCION].create_index("clave", unique=True)
    except Exception:
        # Una base ya creada con claves duplicadas no debe impedir guardar asistencia.
        pass
    _indice_creado = True


def clave_acta(anio_lectivo, tipo, curso, fecha, turno=None, materia=None):
    """Identificador estable y legible de un acta."""
    return "|".join([
        str(anio_lectivo or ""),
        tipo or "",
        curso or "",
        fecha or "",
        turno or "",
        materia or "",
    ])


def _nombre(doc):
    return f"{doc.get('Nombres', '')} {doc.get('Apellido', '')}".strip()


def _roster(curso):
    """Alumnos activos del curso, ordenados por apellido y nombre.

    Incluye los que no tienen registro todavía: el acta documenta la clase
    completa, no solo a quienes se les marcó un estado.
    """
    docs = _mongo_db["usuarios"].find({"Curso": curso, "estado": {"$ne": "Baja"}})
    alumnos = [d for d in docs if "Alumno" in get_roles(d)]
    # 'normalizar' quita tildes para que Álvarez ordene antes que Bromas,
    # que es como se ordena alfabéticamente en el listado del curso.
    alumnos.sort(key=lambda d: (
        normalizar(d.get("Apellido")),
        normalizar(d.get("Nombres")),
    ))
    return alumnos


def _filtro_docs(anio_lectivo, tipo, curso, fecha, turno=None, materia=None):
    filtro = {
        "anio_lectivo": str(anio_lectivo),
        "tipo": tipo,
        "curso": curso,
        "fecha": fecha,
        "alumnoGmail": {"$exists": True},
        "eliminada": {"$ne": True},
    }
    if tipo == "institucional":
        filtro["turno"] = turno
    else:
        filtro["materia"] = materia
    return filtro


def _registros(anio_lectivo, tipo, curso, fecha, turno=None, materia=None):
    """Arma la lista congelada de la clase, en orden de apellido."""
    por_gmail = {
        d.get("alumnoGmail"): d
        for d in _mongo_db["asistencias"].find(
            _filtro_docs(anio_lectivo, tipo, curso, fecha, turno, materia)
        )
    }
    registros = []
    for alumno in _roster(curso):
        doc = por_gmail.get(alumno.get("Gmail"))
        just = (doc or {}).get("justificacion") or None
        registros.append({
            "gmail": alumno.get("Gmail", ""),
            "numero": alumno.get("N°"),
            "apellido": alumno.get("Apellido", ""),
            "nombres": alumno.get("Nombres", ""),
            "nombre": _nombre(alumno) or alumno.get("Gmail", ""),
            "turno": alumno.get("Turno") or "",
            "estado": (doc or {}).get("estado"),
            "minutosRetraso": (doc or {}).get("minutosRetraso"),
            "horaIngreso": (doc or {}).get("horaIngreso"),
            "observacion": (doc or {}).get("observacion") or "",
            "justificacion": (just or {}).get("estado"),
            "registradoPor": (doc or {}).get("registradoPor", ""),
        })
    return registros


def _resumen(registros):
    """Conteos para el encabezado del PDF y el resumen de la UI."""
    r = {"total": len(registros), "presentes": 0, "ausentes": 0, "tardes": 0, "sinMarcar": 0}
    for reg in registros:
        estado = reg.get("estado")
        if estado == "Presente":
            r["presentes"] += 1
        elif estado == "Ausente":
            r["ausentes"] += 1
        elif estado == "Tarde":
            r["tardes"] += 1
        else:
            r["sinMarcar"] += 1
    r["inasistencias"] = r["ausentes"] + r["tardes"]
    return r


def construir_acta(anio_lectivo, tipo, curso, fecha, turno=None, materia=None):
    """Devuelve el cuerpo del acta con los registros ya resueltos."""
    conf = get_config()
    registros = _registros(anio_lectivo, tipo, curso, fecha, turno, materia)
    return {
        "clave": clave_acta(anio_lectivo, tipo, curso, fecha, turno, materia),
        "anio_lectivo": str(anio_lectivo),
        "tipo": tipo,
        "curso": curso,
        "fecha": fecha,
        "turno": turno or None,
        "materia": materia or None,
        "escuela": conf.get("nombre_escuela") or "",
        "anio_lectivo_config": str(conf.get("anio_lectivo") or anio_lectivo),
        "registros": registros,
        "resumen": _resumen(registros),
    }


def registrar_acta(request, gmail_sesion, usuario_doc, tipo, curso, fecha,
                   turno=None, materia=None, anio_lectivo=None):
    """Genera o actualiza el acta de la clase y la deja guardada.

    Nunca lanza: si el snapshot falla, la asistencia ya quedó persistida y
    el guardado no debe fallar por esto. Devuelve un resumen corto para la
    respuesta de la API, o None si no se pudo guardar.
    """
    try:
        _asegurar_indice()
        if anio_lectivo is None:
            anio_lectivo = str(get_config().get("anio_lectivo") or datetime.now().year)

        acta = construir_acta(anio_lectivo, tipo, curso, fecha, turno, materia)
        ahora = datetime.now().isoformat()
        nombre = _nombre(usuario_doc) or gmail_sesion
        rol = " / ".join(get_roles(usuario_doc)) if get_roles(usuario_doc) else ""

        revision = {
            "fecha": ahora,
            "por": nombre,
            "porGmail": gmail_sesion,
            "porRol": rol,
            "resumen": acta["resumen"],
        }
        acta["actualizado"] = ahora
        acta["generadoPor"] = nombre
        acta["generadoPorGmail"] = gmail_sesion
        acta["generadoPorRol"] = rol

        existente = _mongo_db[COLECCION].find_one({"clave": acta["clave"]})

        if not existente:
            acta["creado"] = ahora
            acta["version"] = 1
            acta["revisiones"] = [revision]
            _mongo_db[COLECCION].insert_one(acta)
        else:
            # Se conserva quién creó el acta; sólo se actualiza el contenido.
            acta["creado"] = existente.get("creado", ahora)
            acta["version"] = int(existente.get("version") or 0) + 1
            revisiones = list(existente.get("revisiones") or [])
            revisiones.append(revision)
            acta["revisiones"] = revisiones[-MAX_REVISIONES:]
            _mongo_db[COLECCION].replace_one({"clave": acta["clave"]}, acta)

        return {
            "clave": acta["clave"],
            "version": acta["version"],
            "resumen": acta["resumen"],
        }
    except Exception:
        return None


def obtener_acta(clave):
    return _mongo_db[COLECCION].find_one({"clave": clave})


def _resumen_publico(acta):
    """Vista del acta sin el detalle fila por fila (para los listados)."""
    return {
        "clave": acta.get("clave"),
        "anio_lectivo": acta.get("anio_lectivo"),
        "tipo": acta.get("tipo"),
        "curso": acta.get("curso"),
        "fecha": acta.get("fecha"),
        "turno": acta.get("turno"),
        "materia": acta.get("materia"),
        "escuela": acta.get("escuela"),
        "resumen": acta.get("resumen") or {},
        "version": acta.get("version", 1),
        "generadoPor": acta.get("generadoPor", ""),
        "generadoPorRol": acta.get("generadoPorRol", ""),
        "creado": acta.get("creado", ""),
        "actualizado": acta.get("actualizado", ""),
    }


def lista_publica(actas):
    return [_resumen_publico(a) for a in actas]
