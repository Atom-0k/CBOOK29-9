import json
import random
import re
import string
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import bcrypt
from bson import ObjectId
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .views import _mongo_db, _get_usuario_doc, _get_roles, _destino_texto
from .auth import log_accion as _auth_log, get_config as _auth_config, validar_password
from config import env as env_conf

BACKUP_DIR = Path(env_conf.env("BACKUP_DIR") or (settings.BASE_DIR / "data" / "backups"))


def _resp(data, status=200):
    return JsonResponse(data, status=status)


def _admin(request):
    """Devuelve (gmail, None) si el usuario logueado es Admin, o (None, error)."""
    gmail = request.session.get('usuario_gmail')
    if not gmail:
        return None, _resp({"error": "No autenticado"}, 401)
    doc = _get_usuario_doc(gmail)
    if not doc or "Admin" not in _get_roles(doc):
        return None, _resp({"error": "No autorizado"}, 403)
    return gmail, None


def _nombre(apellido, nombres):
    return f"{nombres or ''} {apellido or ''}".strip()


def _nombre_curso(curso_id):
    """Devuelve el nombre del curso dado su ObjectId (o '' si no existe)."""
    cdoc = _mongo_db["cursos"].find_one({"_id": curso_id})
    return cdoc["nombre"] if cdoc else ""


def _dni(u, gmail):
    """Devuelve el N° de legajo. Si la base no lo tiene cargado, se lo
    deriva del local-part del correo (ej. 50394251@insi.edu.ar -> 50394251),
    que en esta escuela coincide con el DNI."""
    n = u.get("N°")
    if n:
        return n
    local = (gmail or "").split("@")[0]
    return int(local) if local.isdigit() else None


def _nombre_admin(gmail):
    """Nombre legible de un admin para registrar quién realizó una acción."""
    doc = _get_usuario_doc(gmail)
    return _nombre(doc.get("Apellido"), doc.get("Nombres")) if doc else gmail


def _normalizar(texto):
    """Minúsculas, sin tildes y sin espacios sobrantes, para que la búsqueda
    no falle por acentos o mayúsculas (ej. 'gonzalez' encuentra 'González')."""
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    return "".join(c for c in texto if not unicodedata.combining(c)).strip()


def _log_accion(request, accion, detalle=""):
    """Registra un evento de auditoría (delega en auth.log_accion)."""
    return _auth_log(request, accion, detalle)


def _int_query(request, clave, default):
    """Lee un entero de querystring de forma segura (nunca rompe)."""
    try:
        return int(request.GET.get(clave, default))
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

def _get_config():
    return _auth_config()


def _save_config(cambios):
    _mongo_db["config"].update_one({"_id": "config"}, {"$set": cambios}, upsert=True)


# ---------------------------------------------------------------------------
# Conteos de notas compartidos
# ---------------------------------------------------------------------------

def _nota_conteos():
    """Devuelve (directo, por_curso): conteos de notas agrupados por el
    gmail del alumno destinatario y por curso (notas "Todo el curso")."""
    directo = {}
    por_curso = {}

    def inc(d, k, requiere, confirmada):
        if not k:
            return
        e = d.setdefault(k, {"total": 0, "pendientes": 0, "confirmadas": 0})
        e["total"] += 1
        if requiere:
            if confirmada:
                e["confirmadas"] += 1
            else:
                e["pendientes"] += 1

    for n in _mongo_db["notas"].find(
        {}, {"AlumnoGmail": 1, "Curso": 1, "requierePin": 1, "confirmada": 1, "eliminada": 1}
    ):
        if n.get("eliminada"):
            continue
        req = bool(n.get("requierePin"))
        conf = bool(n.get("confirmada"))
        if n.get("AlumnoGmail"):
            inc(directo, n["AlumnoGmail"], req, conf)
        else:
            inc(por_curso, n.get("Curso"), req, conf)
    return directo, por_curso


def _pin_info(u):
    return {
        "tiene": bool(u.get("pinResponsable")),
        "habilitado": bool(u.get("pin_habilitado", True)),
        "intentosFallidos": int(u.get("pin_intentos_fallidos") or 0),
        "ultimoUso": u.get("pin_ultimo_uso") or "",
        "fechaCreacion": u.get("pin_fecha_creacion") or "",
    }


def _validar_gmail(gmail):
    gmail = (gmail or "").strip().lower()
    if not gmail:
        return None, "Falta el Gmail"
    if "@" not in gmail:
        gmail = f"{gmail}@insi.edu.ar"
    return gmail, None


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def _email_tutor(valor):
    """Normaliza el correo del tutor. Vacío es válido: puede no cargarse.

    A diferencia del Gmail del alumno NO se le agrega @insi.edu.ar: el tutor
    es una persona externa y su correo puede ser de cualquier proveedor.
    """
    email = (valor or "").strip().lower()
    if not email:
        return None, None
    if not _EMAIL.match(email):
        return None, "El Gmail del tutor no es un correo válido"
    return email, None


def _regenerar_pin(request, gmail, doc):
    conf = _get_config()
    largo = max(4, min(10, int(conf.get("long_pin", 8))))
    pin = "".join(random.choices(string.digits, k=largo))
    pin_hash = bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    ahora = datetime.now().isoformat()
    _mongo_db["usuarios"].update_one({"Gmail": gmail}, {"$set": {
        "pinResponsable": pin_hash,
        "pin_habilitado": True,
        "pin_intentos_fallidos": 0,
        "pin_ultimo_uso": "",
        "pin_fecha_creacion": ahora,
    }})
    _log_accion(request, "Generar PIN", gmail)
    return _resp({"ok": True, "pin": pin})


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@require_GET
def api_admin_dashboard(request):
    gmail, err = _admin(request)
    if err:
        return err

    usuarios = list(_mongo_db["usuarios"].find({}))
    conteos = {"Alumno": 0, "Profesor": 0, "Preceptor": 0}
    bloqueados = 0
    activos_hoy = 0
    hoy_iso = date.today().isoformat()
    for u in usuarios:
        roles = _get_roles(u)
        if "Alumno" in roles:
            conteos["Alumno"] += 1
        if "Profesor" in roles:
            conteos["Profesor"] += 1
        if "Preceptor" in roles:
            conteos["Preceptor"] += 1
        if (u.get("estado") or "Activo") == "Bloqueado":
            bloqueados += 1
        if (u.get("UltimoIngreso") or "").startswith(hoy_iso):
            activos_hoy += 1

    total_cursos = _mongo_db["cursos"].count_documents({})
    materias = set()
    for a in _mongo_db["asignaciones"].find({}, {"materia": 1}):
        if a.get("materia"):
            materias.add(a["materia"])

    docs_notas = list(_mongo_db["notas"].find({}))
    notas_totales = len(docs_notas)
    notas_pendientes = sum(
        1 for n in docs_notas
        if n.get("requierePin") and not n.get("confirmada") and not n.get("eliminada")
    )
    notas_confirmadas = sum(
        1 for n in docs_notas
        if n.get("requierePin") and n.get("confirmada") and not n.get("eliminada")
    )
    notas_hoy = sum(1 for n in docs_notas if (n.get("Fecha") or "").startswith(hoy_iso))
    en_papelera = sum(1 for n in docs_notas if n.get("eliminada"))

    notas_por_dia = []
    confirm_por_dia = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        notas_por_dia.append({"fecha": d, "total": 0, "pendientes": 0, "confirmadas": 0})
        confirm_por_dia.append({"fecha": d, "total": 0})
    idx = {d["fecha"]: i for i, d in enumerate(notas_por_dia)}

    por_tipo = defaultdict(int)
    notas_por_curso = defaultdict(int)
    for n in docs_notas:
        f = (n.get("Fecha") or "")[:10]
        if f in idx:
            e = notas_por_dia[idx[f]]
            e["total"] += 1
            if n.get("requierePin"):
                if n.get("confirmada"):
                    e["confirmadas"] += 1
                else:
                    e["pendientes"] += 1
        cf = (n.get("confirmadaFecha") or "")[:10]
        if cf in idx:
            confirm_por_dia[idx[cf]]["total"] += 1
        por_tipo[n.get("Tipo") or "comunicado"] += 1
        notas_por_curso[n.get("Curso") or ""] += 1

    top_cursos = sorted(
        ({"curso": c, "notas": n} for c, n in notas_por_curso.items() if c),
        key=lambda x: x["notas"],
        reverse=True,
    )[:6]

    ultimo_backup = None
    b = _mongo_db["backups"].find_one({}, sort=[("Fecha", -1)])
    if b:
        ultimo_backup = {"nombre": b.get("Nombre"), "fecha": b.get("Fecha")}

    config = _get_config()

    return _resp({
        "alumnos": conteos["Alumno"],
        "profesores": conteos["Profesor"],
        "preceptores": conteos["Preceptor"],
        "cursos": total_cursos,
        "materias": len(materias),
        "notas_totales": notas_totales,
        "notas_hoy": notas_hoy,
        "notas_pendientes": notas_pendientes,
        "notas_confirmadas": notas_confirmadas,
        "en_papelera": en_papelera,
        "bloqueados": bloqueados,
        "activos_hoy": activos_hoy,
        "ultimo_backup": ultimo_backup,
        "config": config,
        "series": {
            "notas_por_dia": notas_por_dia,
            "confirm_por_dia": confirm_por_dia,
        },
        "distribucion": {"por_tipo": dict(por_tipo), "por_rol": conteos},
        "top_cursos": top_cursos,
    })


# ---------------------------------------------------------------------------
# Usuarios (Alumnos / Profesores / Preceptores)
# ---------------------------------------------------------------------------

@require_GET
def api_admin_usuarios(request):
    gmail, err = _admin(request)
    if err:
        return err

    rol = request.GET.get("rol", "").strip()
    busqueda = request.GET.get("busqueda", "").strip().lower()
    # Se normaliza (sin acentos) y además se descarta el dominio del correo
    # para que buscar "48379007@insi.edu.ar" también encuentre por DNI.
    busqueda_norm = _normalizar(busqueda)
    curso = request.GET.get("curso", "").strip()
    estado = request.GET.get("estado", "").strip()
    pagina = max(1, _int_query(request, "pagina", 1))
    por_pagina = min(100, max(10, _int_query(request, "por_pagina", 25)))

    directo, por_curso = _nota_conteos()

    # Los preceptores NO tienen el curso en el campo "Curso" del usuario:
    # el curso asignado vive en la colección 'asignaciones' como una
    # asignación SIN materia. Se precalcula acá para no consultar Mongo
    # por cada usuario.
    cursos_preceptores = defaultdict(list)
    nombres_curso = {}
    for a in _mongo_db["asignaciones"].find({"materia": None}):
        cid = a.get("curso_id")
        if cid not in nombres_curso:
            cdoc = _mongo_db["cursos"].find_one({"_id": cid})
            nombres_curso[cid] = cdoc["nombre"] if cdoc else ""
        nombre_c = nombres_curso[cid]
        if nombre_c:
            cursos_preceptores[a.get("usuario_id")].append(nombre_c)

    lista = []
    visto = set()
    for u in _mongo_db["usuarios"].find({}):
        g = u.get("Gmail") or ""
        # Un correo = una sola cuenta/alumno: no repetirlo (evita que un
        # mismo alumno aparezca varias veces con diferente curso).
        if not g or g in visto:
            continue
        visto.add(g)
        roles = _get_roles(u)
        if rol and not any(r == rol for r in roles):
            continue
        tipo = rol if rol else (roles[0] if roles else "Alumno")
        nombre = _nombre(u.get("Apellido"), u.get("Nombres"))
        u_curso = u.get("Curso") or ""
        # Para preceptor el curso es el asignado en 'asignaciones'.
        cursos_asig = sorted(set(cursos_preceptores.get(u.get("_id"), [])))
        if "Preceptor" in roles and cursos_asig:
            u_curso = ", ".join(cursos_asig)
        if curso:
            cursos_a_filtrar = cursos_asig if "Preceptor" in roles else [u_curso]
            if curso not in cursos_a_filtrar:
                continue
        est = u.get("estado") or "Activo"
        if estado:
            # "no_baja" muestra activos y bloqueados pero NO los dados de baja:
            # un alumno de baja no debe aparecer en las listas normales.
            if estado == "no_baja":
                if est == "Baja":
                    continue
            elif est != estado:
                continue
        dni = _dni(u, g)
        if busqueda_norm:
            apellido = _normalizar(u.get("Apellido"))
            nombres = _normalizar(u.get("Nombres"))
            # Se arma un texto único con todos los campos y se exige que
            # CADA palabra de la búsqueda aparezca (así "acevedo lucas" o
            # "lucas acevedo" encuentra "Lucas Martín Acevedo").
            combinado = f"{apellido} {nombres} {g.lower()} {str(dni)}"
            tokens = busqueda_norm.split()
            hay = bool(tokens and all(t in combinado for t in tokens))
            if not hay:
                continue
        dc = directo.get(g, {"total": 0, "pendientes": 0, "confirmadas": 0})
        cc = por_curso.get(u_curso, {"total": 0, "pendientes": 0, "confirmadas": 0})
        lista.append({
            "gmail": g,
            "numero": dni,
            "apellido": u.get("Apellido") or "",
            "nombres": u.get("Nombres") or "",
            "nombre": nombre,
            "curso": u_curso,
            "cursos": cursos_asig if "Preceptor" in roles else [],
            "turno": u.get("Turno") or "",
            "emailTutor": u.get("EmailTutor") or "",
            "roles": roles,
            "tipo": tipo,
            "estado": est,
            "bloqueo": u.get("bloqueo") or None,
            "baja": u.get("baja") or None,
            "historial": u.get("historial_estados") or [],
            "pin": _pin_info(u),
            "ultimoIngreso": u.get("UltimoIngreso") or "",
            "creado": u.get("FechaCreacion") or "",
            "notasTotal": dc["total"] + cc["total"],
            "notasPendientes": dc["pendientes"] + cc["pendientes"],
            "notasConfirmadas": dc["confirmadas"] + cc["confirmadas"],
        })

    lista.sort(key=lambda x: (x["apellido"].lower(), x["nombres"].lower()))
    total = len(lista)
    paginas = max(1, -(-total // por_pagina))
    inicio = (pagina - 1) * por_pagina
    return _resp({
        "usuarios": lista[inicio:inicio + por_pagina],
        "total": total,
        "paginas": paginas,
        "pagina": pagina,
        "por_pagina": por_pagina,
    })


@require_POST
def api_admin_usuarios_crear(request):
    gmail_sesion, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    tipo = (data.get("tipo") or "").strip()
    apellido = (data.get("apellido") or "").strip()
    nombres = (data.get("nombres") or "").strip()
    curso = (data.get("curso") or "").strip()
    turno = (data.get("turno") or "").strip()
    numero = (data.get("numero") or "").strip()
    password = (data.get("password") or "").strip()
    email_tutor, errt = _email_tutor(data.get("emailTutor"))
    if errt:
        return _resp({"error": errt}, 400)
    gmail, errg = _validar_gmail(data.get("gmail"))
    if errg:
        return _resp({"error": errg}, 400)

    if tipo not in ("Alumno", "Profesor", "Preceptor"):
        return _resp({"error": "Tipo de usuario inválido"}, 400)
    if not (apellido and nombres):
        return _resp({"error": "Faltan el apellido o los nombres"}, 400)
    if tipo == "Alumno" and not curso:
        return _resp({"error": "El alumno necesita un curso"}, 400)
    if _mongo_db["usuarios"].find_one({"Gmail": gmail}):
        return _resp({"error": "Ya existe un usuario con ese Gmail"}, 400)

    if not password:
        return _resp({"error": "La contraseña es obligatoria (mínimo 8 caracteres)"}, 400)
    ok_pass, msg_pass = validar_password(password)
    if not ok_pass:
        return _resp({"error": msg_pass}, 400)
    hash_pass = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    doc = {
        "Gmail": gmail,
        "Apellido": apellido,
        "Nombres": nombres,
        "Contraseña": hash_pass,
        "Rol": tipo,
        "Curso": curso if tipo == "Alumno" else (curso or None),
        "Turno": turno if tipo == "Alumno" else None,
        "N°": int(numero) if numero.isdigit() else None,
        "EmailTutor": email_tutor if tipo == "Alumno" else None,
        "estado": "Activo",
        "FechaCreacion": datetime.now().isoformat(),
    }
    resultado = _mongo_db["usuarios"].insert_one(doc)

    # Para el preceptor el curso se guarda además en 'asignaciones'
    # (asignación sin materia), que es donde el sistema lo lee.
    if tipo == "Preceptor" and curso:
        cdoc = _mongo_db["cursos"].find_one({"nombre": curso})
        if cdoc:
            _mongo_db["asignaciones"].insert_one({
                "usuario_id": resultado.inserted_id,
                "curso_id": cdoc["_id"],
                "materia": None,
                "rol": "preceptor",
            })

    _log_accion(request, f"Crear {tipo.lower()}", f"{nombres} {apellido} ({gmail})")
    return _resp({"ok": True, "gmail": gmail})


@require_POST
def api_admin_usuarios_editar(request):
    gmail_sesion, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    gmail = (data.get("gmail") or "").strip()
    doc = _mongo_db["usuarios"].find_one({"Gmail": gmail})
    if not doc:
        return _resp({"error": "Usuario no encontrado"}, 404)

    cambios = {}
    if "apellido" in data and (data.get("apellido") or "").strip():
        cambios["Apellido"] = (data.get("apellido") or "").strip()
    if "nombres" in data and (data.get("nombres") or "").strip():
        cambios["Nombres"] = (data.get("nombres") or "").strip()
    if "curso" in data:
        cambios["Curso"] = (data.get("curso") or "").strip() or None
    if "turno" in data:
        cambios["Turno"] = (data.get("turno") or "").strip() or None
    if "numero" in data:
        num = (data.get("numero") or "").strip()
        cambios["N°"] = int(num) if num.isdigit() else None
    if "emailTutor" in data:
        email_tutor, errt = _email_tutor(data.get("emailTutor"))
        if errt:
            return _resp({"error": errt}, 400)
        # Se puede borrar dejando el campo vacío.
        cambios["EmailTutor"] = email_tutor
    if "estado" in data and data.get("estado") in ("Activo", "Baja", "Bloqueado", "Suspendido"):
        cambios["estado"] = data.get("estado")

    if not cambios:
        return _resp({"error": "Sin cambios"}, 400)

    _mongo_db["usuarios"].update_one({"Gmail": gmail}, {"$set": cambios})

    # Si editan el curso de un preceptor, se sincroniza la asignación
    # (sin materia) para que el cambio se refleje en todo el sistema.
    # Solo se reemplaza si el curso elegido es distinto del asignado
    # actualmente, para no pisar preceptores con varios cursos a cargo.
    if "curso" in data and "Preceptor" in _get_roles(doc):
        nuevo_curso = (data.get("curso") or "").strip()
        cursos_actuales = sorted(
            cn for a in _mongo_db["asignaciones"].find(
                {"usuario_id": doc["_id"], "materia": None}
            ) if (cn := _nombre_curso(a.get("curso_id")))
        )
        if nuevo_curso and cursos_actuales != [nuevo_curso]:
            _mongo_db["asignaciones"].delete_many({"usuario_id": doc["_id"], "materia": None})
            cdoc = _mongo_db["cursos"].find_one({"nombre": nuevo_curso})
            if cdoc:
                _mongo_db["asignaciones"].insert_one({
                    "usuario_id": doc["_id"],
                    "curso_id": cdoc["_id"],
                    "materia": None,
                    "rol": "preceptor",
                })

    _log_accion(request, "Editar usuario", f"{gmail}: {', '.join(cambios.keys())}")
    return _resp({"ok": True})


@require_POST
def api_admin_usuarios_accion(request):
    gmail_sesion, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    gmail = (data.get("gmail") or "").strip()
    accion = (data.get("accion") or "").strip()
    motivo = (data.get("motivo") or "").strip()
    doc = _mongo_db["usuarios"].find_one({"Gmail": gmail})
    if not doc:
        return _resp({"error": "Usuario no encontrado"}, 404)

    admin_nombre = _nombre_admin(gmail_sesion)
    ahora = datetime.now().isoformat()

    def registrar_historial(accion_label, motivo_=""):
        """Guarda en el documento del usuario el historial de estados, para
        que el admin pueda ver quién hizo cada cambio, cuándo y el motivo."""
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail},
            {"$push": {"historial_estados": {
                "fecha": ahora,
                "accion": accion_label,
                "admin": admin_nombre,
                "motivo": motivo_ or "",
            }}},
        )

    if accion == "baja":
        if not motivo:
            return _resp({"error": "El motivo de la baja es obligatorio"}, 400)
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail},
            {"$set": {
                "estado": "Baja",
                "baja": {"fecha": ahora, "admin": admin_nombre, "motivo": motivo},
            }, "$unset": {"bloqueo": ""}},
        )
        registrar_historial("Dado de baja", motivo)
        detalle = f"Dar de baja ({motivo})"
    elif accion == "reactivar":
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail},
            {"$set": {"estado": "Activo"}, "$unset": {"baja": ""}},
        )
        registrar_historial("Reactivado", motivo)
        detalle = "Reactivar"
    elif accion == "bloquear":
        if not motivo:
            return _resp({"error": "El motivo del bloqueo es obligatorio"}, 400)
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail},
            {"$set": {
                "estado": "Bloqueado",
                "bloqueo": {"fecha": ahora, "admin": admin_nombre, "motivo": motivo},
            }},
        )
        registrar_historial("Bloqueado", motivo)
        detalle = f"Bloquear ({motivo})"
    elif accion == "desbloquear":
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail},
            {"$set": {"estado": "Activo", "pin_intentos_fallidos": 0}, "$unset": {"bloqueo": ""}},
        )
        registrar_historial("Desbloqueado", motivo)
        detalle = "Desbloquear"
    elif accion == "resetear_password":
        nueva = (data.get("nuevaPassword") or "").strip()
        ok_pass, msg_pass = validar_password(nueva)
        if not ok_pass:
            return _resp({"error": msg_pass}, 400)
        h = bcrypt.hashpw(nueva.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        _mongo_db["usuarios"].update_one({"Gmail": gmail}, {"$set": {"Contraseña": h}})
        detalle = "Restablecer contraseña"
    elif accion == "regenerar_pin":
        return _regenerar_pin(request, gmail, doc)
    else:
        return _resp({"error": "Acción desconocida"}, 400)

    _log_accion(request, detalle, gmail)
    return _resp({"ok": True})


# ---------------------------------------------------------------------------
# Cursos
# ---------------------------------------------------------------------------

@require_GET
def api_admin_cursos(request):
    gmail, err = _admin(request)
    if err:
        return err

    por_curso = {}
    for u in _mongo_db["usuarios"].find({}, {"Rol": 1, "Curso": 1, "Nombres": 1, "Apellido": 1}):
        c = u.get("Curso")
        if not c:
            continue
        roles = _get_roles(u)
        if "Alumno" in roles:
            e = por_curso.setdefault(c, {"alumnos": 0})
            e["alumnos"] += 1

    materias_por_curso = defaultdict(set)
    prof_por_curso = defaultdict(set)
    preceptores_por_curso = defaultdict(list)
    for a in _mongo_db["asignaciones"].find({}):
        cdoc = _mongo_db["cursos"].find_one({"_id": a.get("curso_id")})
        cn = cdoc["nombre"] if cdoc else ""
        if not cn:
            continue
        if a.get("materia"):
            materias_por_curso[cn].add(a["materia"])
        udoc = _mongo_db["usuarios"].find_one({"_id": a.get("usuario_id")})
        if not udoc:
            continue
        if a.get("materia"):
            prof_por_curso[cn].add(_nombre(udoc.get("Apellido"), udoc.get("Nombres")))
        else:
            # Asignación SIN materia = el curso a cargo de un preceptor.
            preceptores_por_curso[cn].append(_nombre(udoc.get("Apellido"), udoc.get("Nombres")))

    notas_por_curso = defaultdict(lambda: {"total": 0, "pendientes": 0, "confirmadas": 0})
    for n in _mongo_db["notas"].find(
        {}, {"Curso": 1, "requierePin": 1, "confirmada": 1, "eliminada": 1}
    ):
        if n.get("eliminada"):
            continue
        e = notas_por_curso[n.get("Curso") or ""]
        e["total"] += 1
        if n.get("requierePin"):
            if n.get("confirmada"):
                e["confirmadas"] += 1
            else:
                e["pendientes"] += 1

    cursos_docs = list(_mongo_db["cursos"].find({}))
    lista = []
    for c in sorted(cursos_docs, key=lambda x: x.get("nombre") or ""):
        nombre = c.get("nombre") or ""
        e = por_curso.get(nombre, {"alumnos": 0})
        n = notas_por_curso.get(nombre, {"total": 0, "pendientes": 0, "confirmadas": 0})
        materias = sorted(materias_por_curso.get(nombre, set()))
        lista.append({
            "_id": str(c["_id"]),
            "nombre": nombre,
            "especialidad": c.get("especialidad") or "",
            "anio_lectivo": c.get("año_lectivo") or c.get("anio_lectivo") or "",
            "alumnos": e["alumnos"],
            "cantMaterias": len(materias),
            "materias": materias,
            "profesores": sorted(prof_por_curso.get(nombre, set())),
            "preceptores": sorted(set(preceptores_por_curso.get(nombre, []))),
            "notasTotal": n["total"],
            "notasPendientes": n["pendientes"],
            "notasConfirmadas": n["confirmadas"],
            "activo": bool(c.get("activo", True)),
        })
    return _resp({"cursos": lista})


@require_POST
def api_admin_cursos_guardar(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    nombre = (data.get("nombre") or "").strip()
    especialidad = (data.get("especialidad") or "").strip()
    anio = (data.get("anio_lectivo") or str(datetime.now().year)).strip()
    curso_id = data.get("_id") or data.get("id")

    if not nombre:
        return _resp({"error": "Falta el nombre del curso"}, 400)

    if curso_id:
        try:
            oid = ObjectId(curso_id)
        except Exception:
            return _resp({"error": "Curso inválido"}, 400)
        if not _mongo_db["cursos"].find_one({"_id": oid}):
            return _resp({"error": "Curso no encontrado"}, 404)
        _mongo_db["cursos"].update_one(
            {"_id": oid},
            {"$set": {"nombre": nombre, "especialidad": especialidad, "año_lectivo": anio}},
        )
        _log_accion(request, "Editar curso", nombre)
    else:
        if _mongo_db["cursos"].find_one({"nombre": nombre}):
            return _resp({"error": "Ya existe ese curso"}, 400)
        _mongo_db["cursos"].insert_one({
            "nombre": nombre,
            "especialidad": especialidad,
            "año_lectivo": anio,
            "activo": True,
        })
        _log_accion(request, "Crear curso", nombre)
    return _resp({"ok": True})


@require_POST
def api_admin_cursos_accion(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    curso_id = str(data.get("_id") or data.get("id") or "").strip()
    accion = (data.get("accion") or "").strip()
    try:
        oid = ObjectId(curso_id)
    except Exception:
        return _resp({"error": "Curso inválido"}, 400)
    doc = _mongo_db["cursos"].find_one({"_id": oid})
    if not doc:
        return _resp({"error": "Curso no encontrado"}, 404)

    if accion == "duplicar":
        nuevo_nombre = (data.get("nuevoNombre") or "").strip()
        if not nuevo_nombre:
            return _resp({"error": "Falta el nombre del curso nuevo"}, 400)
        if _mongo_db["cursos"].find_one({"nombre": nuevo_nombre}):
            return _resp({"error": "Ya existe ese curso"}, 400)
        _mongo_db["cursos"].insert_one({
            "nombre": nuevo_nombre,
            "especialidad": doc.get("especialidad") or "",
            "año_lectivo": doc.get("año_lectivo") or "",
            "activo": True,
        })
        _log_accion(request, "Duplicar curso", f"{doc.get('nombre')} -> {nuevo_nombre}")
        return _resp({"ok": True})
    elif accion == "desactivar":
        _mongo_db["cursos"].update_one({"_id": oid}, {"$set": {"activo": False}})
        _log_accion(request, "Desactivar curso", doc.get("nombre"))
    elif accion == "activar":
        _mongo_db["cursos"].update_one({"_id": oid}, {"$set": {"activo": True}})
        _log_accion(request, "Activar curso", doc.get("nombre"))
    else:
        return _resp({"error": "Acción desconocida"}, 400)
    return _resp({"ok": True})


@require_GET
def api_admin_curso_detalle(request):
    """GET /api/admin/cursos/detalle/?id=<ObjectId>
    -> detalle de UN curso: sus alumnos y las materias que se dictan
    (con el nombre del profesor de cada una)."""
    gmail, err = _admin(request)
    if err:
        return err

    curso_id = request.GET.get("id", "").strip()
    try:
        oid = ObjectId(curso_id)
    except Exception:
        return _resp({"error": "Curso inválido"}, 400)

    curso_doc = _mongo_db["cursos"].find_one({"_id": oid})
    if not curso_doc:
        return _resp({"error": "Curso no encontrado"}, 404)

    nombre = curso_doc.get("nombre") or ""

    alumnos = []
    for u in _mongo_db["usuarios"].find({"Curso": nombre}):
        if "Alumno" not in _get_roles(u):
            continue
        g = u.get("Gmail") or ""
        alumnos.append({
            "gmail": g,
            "numero": _dni(u, g),
            "apellido": u.get("Apellido") or "",
            "nombres": u.get("Nombres") or "",
            "nombre": _nombre(u.get("Apellido"), u.get("Nombres")),
            "estado": u.get("estado") or "Activo",
            "pin": _pin_info(u),
        })
    alumnos.sort(key=lambda x: (x["apellido"].lower(), x["nombres"].lower()))

    materias_map = {}
    for a in _mongo_db["asignaciones"].find(
        {"curso_id": oid, "materia": {"$ne": None}}
    ):
        mat = a.get("materia")
        if not mat:
            continue
        udoc = _mongo_db["usuarios"].find_one({"_id": a.get("usuario_id")})
        prof = _nombre(udoc.get("Apellido"), udoc.get("Nombres")) if udoc else ""
        if prof:
            materias_map.setdefault(mat, set()).add(prof)

    materias = [
        {"nombre": m, "profesores": sorted(ps)}
        for m, ps in sorted(materias_map.items())
    ]

    preceptores = []
    for a in _mongo_db["asignaciones"].find({"curso_id": oid, "materia": None}):
        udoc = _mongo_db["usuarios"].find_one({"_id": a.get("usuario_id")})
        if udoc:
            preceptores.append(_nombre(udoc.get("Apellido"), udoc.get("Nombres")))

    return _resp({
        "curso": {
            "_id": str(oid),
            "nombre": nombre,
            "especialidad": curso_doc.get("especialidad") or "",
            "anio_lectivo": curso_doc.get("año_lectivo") or curso_doc.get("anio_lectivo") or "",
        },
        "alumnos": alumnos,
        "materias": materias,
        "preceptores": sorted(set(preceptores)),
    })


# ---------------------------------------------------------------------------
# Materias
# ---------------------------------------------------------------------------

@require_GET
def api_admin_materias(request):
    gmail, err = _admin(request)
    if err:
        return err

    por_materia = defaultdict(lambda: {"cursos": set(), "profesores": set()})
    for a in _mongo_db["asignaciones"].find({}):
        mat = a.get("materia")
        if not mat:
            continue
        cdoc = _mongo_db["cursos"].find_one({"_id": a.get("curso_id")})
        cn = cdoc["nombre"] if cdoc else ""
        udoc = _mongo_db["usuarios"].find_one({"_id": a.get("usuario_id")})
        por_materia[mat]["cursos"].add(cn)
        if udoc:
            por_materia[mat]["profesores"].add(_nombre(udoc.get("Apellido"), udoc.get("Nombres")))

    lista = [
        {
            "nombre": m,
            "cursos": sorted(v["cursos"]),
            "cantCursos": len(v["cursos"]),
            "profesores": sorted(v["profesores"]),
        }
        for m, v in sorted(por_materia.items())
    ]
    return _resp({"materias": lista})


@require_POST
def api_admin_materias_guardar(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    accion = (data.get("accion") or "").strip()
    materia = (data.get("materia") or "").strip()
    if not materia:
        return _resp({"error": "Falta el nombre de la materia"}, 400)

    if accion == "asignar":
        gmail_prof = (data.get("gmailProfesor") or "").strip()
        if not gmail_prof:
            return _resp({"error": "Falta el profesor"}, 400)
        pdoc = _mongo_db["usuarios"].find_one({"Gmail": gmail_prof})
        if not pdoc:
            return _resp({"error": "Profesor no encontrado"}, 404)

        cursos_raw = data.get("cursos")
        if isinstance(cursos_raw, list) and cursos_raw:
            cursos_nombres = [str(c).strip() for c in cursos_raw if str(c).strip()]
        else:
            curso_unico = (data.get("curso") or "").strip()
            cursos_nombres = [curso_unico] if curso_unico else []

        if not cursos_nombres:
            return _resp({"error": "Faltan los cursos"}, 400)

        asignados = 0
        for curso_nombre in cursos_nombres:
            cdoc = _mongo_db["cursos"].find_one({"nombre": curso_nombre})
            if not cdoc:
                continue
            existe = _mongo_db["asignaciones"].find_one({"curso_id": cdoc["_id"], "materia": materia})
            if existe:
                _mongo_db["asignaciones"].update_one(
                    {"_id": existe["_id"]}, {"$set": {"usuario_id": pdoc["_id"]}}
                )
            else:
                _mongo_db["asignaciones"].insert_one({
                    "usuario_id": pdoc["_id"],
                    "curso_id": cdoc["_id"],
                    "materia": materia,
                    "rol": "Profesor",
                })
            asignados += 1

        _log_accion(request, "Asignar materia", f"{materia} -> {', '.join(cursos_nombres)}")
        return _resp({"ok": True, "asignados": asignados})

    if accion == "eliminar":
        curso_nombre = (data.get("curso") or "").strip()
        filtro = {"materia": materia}
        if curso_nombre:
            cdoc = _mongo_db["cursos"].find_one({"nombre": curso_nombre})
            if cdoc:
                filtro["curso_id"] = cdoc["_id"]
        _mongo_db["asignaciones"].delete_many(filtro)
        _log_accion(request, "Quitar materia", f"{materia} {curso_nombre}")
        return _resp({"ok": True})

    if accion == "renombrar":
        nuevo = (data.get("nueva") or "").strip()
        if not nuevo:
            return _resp({"error": "Falta el nuevo nombre"}, 400)
        _mongo_db["asignaciones"].update_many({"materia": materia}, {"$set": {"materia": nuevo}})
        _log_accion(request, "Renombrar materia", f"{materia} -> {nuevo}")
        return _resp({"ok": True})

    return _resp({"error": "Acción desconocida"}, 400)


# ---------------------------------------------------------------------------
# Comunicados (todas las notas del sistema)
# ---------------------------------------------------------------------------

@require_GET
def api_admin_comunicados(request):
    gmail, err = _admin(request)
    if err:
        return err

    curso = request.GET.get("curso", "").strip()
    estado = request.GET.get("estado", "").strip()
    tipo = request.GET.get("tipo", "").strip()
    busqueda = request.GET.get("busqueda", "").strip().lower()
    pagina = max(1, _int_query(request, "pagina", 1))
    por_pagina = min(100, max(10, _int_query(request, "por_pagina", 20)))

    resumen = {"total": 0, "pendientes": 0, "confirmadas": 0, "archivadas": 0, "papelera": 0}
    lista = []
    for n in _mongo_db["notas"].find({}).sort("Fecha", -1):
        destino = _destino_texto(n)
        tipo_nota = n.get("Tipo") or "comunicado"
        requiere = bool(n.get("requierePin"))
        confirmada = bool(n.get("confirmada"))
        eliminada = bool(n.get("eliminada"))
        archivada = bool(n.get("archivada"))

        resumen["total"] += 1
        if eliminada:
            resumen["papelera"] += 1
        elif archivada:
            resumen["archivadas"] += 1
        elif requiere and confirmada:
            resumen["confirmadas"] += 1
        elif requiere and not confirmada:
            resumen["pendientes"] += 1

        if eliminada and estado != "papelera":
            continue
        if not eliminada and estado == "papelera":
            continue
        if estado == "pendientes" and not (requiere and not confirmada):
            continue
        if estado == "confirmadas" and not (requiere and confirmada):
            continue
        if estado == "archivadas" and not archivada:
            continue
        if curso and n.get("Curso") != curso:
            continue
        if tipo and tipo_nota != tipo:
            continue
        if busqueda:
            hay = (
                busqueda in (n.get("Titulo") or "").lower()
                or busqueda in (n.get("Contenido") or "").lower()
                or busqueda in (n.get("Autor") or "").lower()
                or busqueda in destino.lower()
            )
            if not hay:
                continue

        lista.append({
            "id": str(n["_id"]),
            "tipo": tipo_nota,
            "titulo": n.get("Titulo") or "",
            "contenido": n.get("Contenido") or "",
            "autor": n.get("Autor") or "",
            "autorGmail": n.get("AutorGmail") or "",
            "autorRol": n.get("AutorRol") or "",
            "curso": n.get("Curso") or "",
            "destino": destino,
            "fecha": n.get("Fecha") or "",
            "requierePin": requiere,
            "confirmada": confirmada,
            "archivada": archivada,
            "eliminada": eliminada,
            "fechaConfirmada": n.get("confirmadaFecha") or "",
        })

    total = len(lista)
    paginas = max(1, -(-total // por_pagina))
    inicio = (pagina - 1) * por_pagina
    return _resp({
        "comunicados": lista[inicio:inicio + por_pagina],
        "total": total,
        "paginas": paginas,
        "pagina": pagina,
        "resumen": resumen,
    })


@require_POST
def api_admin_comunicados_accion(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    nota_id = (data.get("id") or "").strip()
    accion = (data.get("accion") or "").strip()
    try:
        oid = ObjectId(nota_id)
    except Exception:
        return _resp({"error": "Nota inválida"}, 400)
    doc = _mongo_db["notas"].find_one({"_id": oid})
    if not doc:
        return _resp({"error": "Nota no encontrada"}, 404)

    titulo = doc.get("Titulo") or ""
    if accion == "eliminar":
        _mongo_db["notas"].update_one(
            {"_id": oid},
            {"$set": {"eliminada": True, "eliminadaFecha": datetime.now().isoformat()}},
        )
        detalle = "Eliminar nota"
    elif accion == "restaurar":
        _mongo_db["notas"].update_one(
            {"_id": oid}, {"$unset": {"eliminada": "", "eliminadaFecha": ""}}
        )
        detalle = "Restaurar nota"
    elif accion == "archivar":
        _mongo_db["notas"].update_one({"_id": oid}, {"$set": {"archivada": True}})
        detalle = "Archivar nota"
    elif accion == "desarchivar":
        _mongo_db["notas"].update_one({"_id": oid}, {"$unset": {"archivada": ""}})
        detalle = "Desarchivar nota"
    elif accion == "eliminar_definitivo":
        _mongo_db["notas"].delete_one({"_id": oid})
        _log_accion(request, "Borrar nota definitivamente", titulo)
        return _resp({"ok": True})
    else:
        return _resp({"error": "Acción desconocida"}, 400)

    _log_accion(request, detalle, titulo)
    return _resp({"ok": True})


# ---------------------------------------------------------------------------
# Confirmaciones
# ---------------------------------------------------------------------------

@require_GET
def api_admin_confirmaciones(request):
    gmail, err = _admin(request)
    if err:
        return err

    curso = request.GET.get("curso", "").strip()
    busqueda = request.GET.get("busqueda", "").strip().lower()
    pagina = max(1, _int_query(request, "pagina", 1))
    por_pagina = min(100, max(10, _int_query(request, "por_pagina", 20)))

    lista = []
    for n in _mongo_db["notas"].find(
        {"requierePin": True, "confirmada": True, "eliminada": {"$ne": True}}
    ).sort("Fecha", -1):
        g = n.get("AlumnoGmail")
        nombre = _destino_texto(n)
        curso_al = n.get("Curso")
        if g:
            udoc = _mongo_db["usuarios"].find_one({"Gmail": g})
            curso_al = udoc.get("Curso") if udoc else n.get("Curso")
        if curso and n.get("Curso") != curso:
            continue
        if busqueda and not (
            busqueda in (n.get("Titulo") or "").lower() or busqueda in (nombre or "").lower()
        ):
            continue
        lista.append({
            "id": str(n["_id"]),
            "titulo": n.get("Titulo") or "",
            "tipo": n.get("Tipo") or "comunicado",
            "alumno": nombre,
            "curso": n.get("Curso") or curso_al or "",
            "fechaEnvio": n.get("Fecha") or "",
            "fechaConfirmacion": n.get("confirmadaFecha") or n.get("Fecha") or "",
            "confirmadaPor": n.get("confirmadaPor") or g or "",
            "metodo": "PIN",
        })

    lista.sort(key=lambda x: x["fechaConfirmacion"], reverse=True)
    total = len(lista)
    paginas = max(1, -(-total // por_pagina))
    inicio = (pagina - 1) * por_pagina
    return _resp({
        "confirmaciones": lista[inicio:inicio + por_pagina],
        "total": total,
        "paginas": paginas,
        "pagina": pagina,
    })


# ---------------------------------------------------------------------------
# Gestión de PIN
# ---------------------------------------------------------------------------

@require_GET
def api_admin_pin(request):
    gmail, err = _admin(request)
    if err:
        return err

    estado = request.GET.get("estado", "").strip()
    curso = request.GET.get("curso", "").strip()
    busqueda = request.GET.get("busqueda", "").strip().lower()
    busqueda_norm = _normalizar(busqueda)
    pagina = max(1, _int_query(request, "pagina", 1))
    por_pagina = min(100, max(10, _int_query(request, "por_pagina", 25)))

    lista = []
    resumen = {"sin_pin": 0, "activos": 0, "bloqueados": 0, "inactivos": 0, "total": 0}
    for u in _mongo_db["usuarios"].find({}):
        roles = _get_roles(u)
        if "Alumno" not in roles:
            continue
        pin = _pin_info(u)
        st = (
            "sin_pin" if not pin["tiene"]
            else ("bloqueado" if pin["intentosFallidos"] >= 5 or u.get("estado") == "Bloqueado"
                  else ("inactivo" if not pin["habilitado"] else "activo"))
        )
        resumen["total"] += 1
        if st in resumen:
            resumen[st] += 1

        if estado and estado not in ("todos", "") and st != estado:
            continue
        if curso and u.get("Curso") != curso:
            continue
        g = u.get("Gmail") or ""
        if busqueda_norm:
            combinado = (
                f"{_normalizar(u.get('Apellido'))} {_normalizar(u.get('Nombres'))} {g.lower()}"
            )
            tokens = busqueda_norm.split()
            hay = bool(tokens and all(t in combinado for t in tokens))
            if not hay:
                continue
        lista.append({
            "gmail": g,
            "nombre": _nombre(u.get("Apellido"), u.get("Nombres")),
            "curso": u.get("Curso") or "",
            "estado": st,
            **pin,
        })

    lista.sort(key=lambda x: (x["nombre"] or "").lower())
    total = len(lista)
    paginas = max(1, -(-total // por_pagina))
    inicio = (pagina - 1) * por_pagina
    return _resp({
        "alumnos": lista[inicio:inicio + por_pagina],
        "total": total,
        "paginas": paginas,
        "pagina": pagina,
        "resumen": resumen,
    })


@require_POST
def api_admin_pin_accion(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    gmail_al = (data.get("gmail") or "").strip()
    accion = (data.get("accion") or "").strip()
    doc = _mongo_db["usuarios"].find_one({"Gmail": gmail_al})
    if not doc:
        return _resp({"error": "Alumno no encontrado"}, 404)

    if accion in ("generar", "regenerar"):
        return _regenerar_pin(request, gmail_al, doc)
    if accion == "deshabilitar":
        _mongo_db["usuarios"].update_one({"Gmail": gmail_al}, {"$set": {"pin_habilitado": False}})
        detalle = "Deshabilitar PIN"
    elif accion == "habilitar":
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_al},
            {"$set": {"pin_habilitado": True, "pin_intentos_fallidos": 0}},
        )
        detalle = "Habilitar PIN"
    elif accion == "desbloquear":
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_al},
            {"$set": {"pin_habilitado": True, "pin_intentos_fallidos": 0}},
        )
        detalle = "Desbloquear PIN"
    else:
        return _resp({"error": "Acción desconocida"}, 400)

    _log_accion(request, detalle, gmail_al)
    return _resp({"ok": True})


# ---------------------------------------------------------------------------
# Auditoría
# ---------------------------------------------------------------------------

@require_GET
def api_admin_auditoria(request):
    gmail, err = _admin(request)
    if err:
        return err

    usuario = request.GET.get("usuario", "").strip()
    accion = request.GET.get("accion", "").strip()
    desde = request.GET.get("desde", "").strip()
    hasta = request.GET.get("hasta", "").strip()
    busqueda = request.GET.get("busqueda", "").strip().lower()
    pagina = max(1, _int_query(request, "pagina", 1))
    por_pagina = min(100, max(10, _int_query(request, "por_pagina", 25)))

    filtro = {}
    if usuario:
        filtro["Usuario"] = usuario
    if accion:
        filtro["Accion"] = {"$regex": accion, "$options": "i"}
    if desde:
        filtro["Fecha"] = {"$gte": desde}
    if hasta:
        filtro["Fecha"] = {"$lte": hasta + "T23:59:59.999999"}

    docs = list(_mongo_db["auditoria"].find(filtro).sort("Fecha", -1))
    if busqueda:
        docs = [
            d for d in docs
            if busqueda in (d.get("Usuario") or "").lower()
            or busqueda in (d.get("Accion") or "").lower()
            or busqueda in (d.get("Detalle") or "").lower()
        ]

    lista = [{
        "id": str(d["_id"]),
        "fecha": d.get("Fecha") or "",
        "usuario": d.get("Usuario") or "",
        "accion": d.get("Accion") or "",
        "detalle": d.get("Detalle") or "",
        "ip": d.get("IP") or "",
        "navegador": d.get("Navegador") or "",
        "so": d.get("SO") or "",
    } for d in docs]

    total = len(lista)
    paginas = max(1, -(-total // por_pagina))
    inicio = (pagina - 1) * por_pagina
    return _resp({
        "logs": lista[inicio:inicio + por_pagina],
        "total": total,
        "paginas": paginas,
        "pagina": pagina,
    })


# ---------------------------------------------------------------------------
# Backups
# ---------------------------------------------------------------------------

def _snapshot():
    datos = {}
    for coleccion in ("usuarios", "cursos", "asignaciones", "notas",
                      "calificaciones", "horarios", "auditoria", "config"):
        datos[coleccion] = [_a_json(d) for d in _mongo_db[coleccion].find({})]
    return datos


def _a_json(v):
    """Convierte recursivamente ObjectId (y cualquier tipo no serializable)
    a texto para poder volcar la colección completa a un archivo JSON."""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, dict):
        return {k: _a_json(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_a_json(x) for x in v]
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _a_mongo(v):
    """Recupera los ObjectId de un snapshot restaurado. Solo convierte
    cadenas de 24 caracteres hex (formato de ObjectId), para no romper
    textos legítimos."""
    if isinstance(v, str) and len(v) == 24 and all(ch in "0123456789abcdef" for ch in v):
        try:
            return ObjectId(v)
        except Exception:
            return v
    if isinstance(v, dict):
        return {k: _a_mongo(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_a_mongo(x) for x in v]
    return v


def _restaurar_snapshot(datos):
    for coleccion, docs in datos.items():
        if not isinstance(docs, list):
            continue
        _mongo_db[coleccion].delete_many({})
        nuevos = [_a_mongo(d) for d in docs if isinstance(d, dict)]
        if nuevos:
            _mongo_db[coleccion].insert_many(nuevos)


@require_GET
def api_admin_backups(request):
    gmail, err = _admin(request)
    if err:
        return err

    backups = list(_mongo_db["backups"].find({}).sort("Fecha", -1))
    lista = [{
        "nombre": b.get("Nombre") or "",
        "fecha": b.get("Fecha") or "",
        "tamano": int(b.get("Tamaño") or 0),
        "creadoPor": b.get("CreadoPor") or "",
    } for b in backups]
    return _resp({"backups": lista, "carpeta": str(BACKUP_DIR)})


@require_POST
def api_admin_backups_crear(request):
    gmail, err = _admin(request)
    if err:
        return err

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    nombre = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    ruta = BACKUP_DIR / nombre
    ruta.write_text(json.dumps(_snapshot(), ensure_ascii=False, indent=1), encoding="utf-8")
    tamano = ruta.stat().st_size
    _mongo_db["backups"].insert_one({
        "Nombre": nombre,
        "Fecha": datetime.now().isoformat(),
        "Tamaño": tamano,
        "CreadoPor": gmail,
    })
    _log_accion(request, "Crear backup", nombre)
    return _resp({"ok": True, "nombre": nombre, "tamano": tamano})


@require_POST
def api_admin_backups_restaurar(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)
    nombre = (data.get("nombre") or "").strip()
    # Sanitización anti path traversal: se usa solo el nombre de archivo.
    ruta = BACKUP_DIR / Path(nombre).name
    if not ruta.exists() or ruta.parent != BACKUP_DIR:
        return _resp({"error": "Backup no encontrado"}, 404)

    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        _restaurar_snapshot(datos)
    except Exception:
        _log_accion(request, "Restaurar backup FALLIDO", nombre)
        return _resp({"error": "No se pudo restaurar el backup. Revisá que el archivo sea válido."}, 400)

    _log_accion(request, "Restaurar backup", nombre)
    return _resp({"ok": True})


@require_GET
def api_admin_backups_descargar(request):
    gmail, err = _admin(request)
    if err:
        return err

    nombre = Path(request.GET.get("nombre", "").strip()).name
    ruta = BACKUP_DIR / nombre
    if not ruta.exists() or ruta.parent != BACKUP_DIR:
        return _resp({"error": "Backup no encontrado"}, 404)

    from django.http import HttpResponse
    resp = HttpResponse(ruta.read_bytes(), content_type="application/json")
    resp["Content-Disposition"] = f'attachment; filename="{nombre}"'
    return resp


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

@require_GET
def api_admin_config(request):
    gmail, err = _admin(request)
    if err:
        return err
    return _resp({"config": _get_config()})


@require_POST
def api_admin_config_guardar(request):
    gmail, err = _admin(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, 400)

    permitidos = (
        "nombre_escuela", "anio_lectivo", "duracion_sesion_min",
        "long_min_contrasena", "long_pin", "modo_mantenimiento", "notificaciones_email",
        "limite_inasistencias", "porcentaje_min_asistencia", "minutos_tolerancia_tardia",
    )
    cambios = {k: v for k, v in data.items() if k in permitidos}
    if not cambios:
        return _resp({"error": "Sin cambios"}, 400)

    _save_config(cambios)
    _log_accion(request, "Guardar configuración", ", ".join(cambios.keys()))
    return _resp({"ok": True})
