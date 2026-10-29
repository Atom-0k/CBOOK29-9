import json
from datetime import date, datetime, timedelta
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from pathlib import Path
from django.conf import settings
from django.shortcuts import render, redirect
import bcrypt
class _UsuarioDoc:
    """Wrapper liviano para un documento de MongoDB con los atributos
    que el código espera (.gmail, .contrasena, .curso, .nombres, .apellido)."""
    def __init__(self, doc):
        self._doc = doc or {}
        self.gmail = self._doc.get("Gmail", "")
        self.contrasena = self._doc.get("Contraseña", "")
        self.curso = self._doc.get("Curso", "")
        self.nombres = self._doc.get("Nombres", "")
        self.apellido = self._doc.get("Apellido", "")


def _buscar_usuario_mongo(gmail):
    """Busca un usuario por gmail directamente en MongoDB."""
    doc = _mongo_db["usuarios"].find_one({"Gmail": gmail})
    return _UsuarioDoc(doc) if doc else None

from .auth import (
    _mongo_db,
    alumno_de_curso,
    autenticar,
    can_acceder_alumno,
    cursos_preceptor,
    cursos_profesor,
    cursos_materias_profesor,
    es_staff,
    get_asignaciones,
    get_config,
    get_roles,
    get_usuario_doc,
    limpiar_intentos,
    log_accion,
    login_limite_ip,
    nota_corresponde_a,
    pin_limite_ip,
    puede_acceder_alumnos_curso,
    puede_acceder_asignacion,
    rate_limitar,
    validar_password,
    verificar_contrasena,
    verificar_pin,
)

# Re-export de helpers usados por admin_views / asistencia_views
_get_usuario_doc = get_usuario_doc
_get_roles = get_roles
_get_asignaciones = get_asignaciones
_puede_acceder_asignacion = puede_acceder_asignacion

@require_GET
def api_alumnos_por_curso(request):
    """GET /api/alumnos/?curso=7A&asignacion=... -> lista de alumnos reales de ese curso.

    Si se proporciona ``asignacion`` (el _id de una asignación), el servidor
    valida que dicha asignación pertenezca al usuario y que el curso
    coincide.  Esto evita que un usuario con dos asignaciones para el mismo
    curso (ej. Profesor 6B + Preceptor 6B) reciba datos fuera de contexto.

    Autorización (OR de permisos por rol, ver auth.puede_acceder_alumnos_curso):
      * Admin: cualquier curso.
      * Preceptor: solo los cursos a su cargo.
      * Profesor: solo los cursos donde dicta una materia.
      * Alumno puro: solo su propio registro y SOLO si coincide con su curso.
      * Un usuario con profesor+preceptor conserva los permisos de ambos.
    """
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    usuario_doc = _get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return JsonResponse({"error": "No autorizado"}, status=403)

    roles = _get_roles(usuario_doc)
    curso = request.GET.get('curso', '').strip()
    asignacion_id = (request.GET.get('asignacion') or "").strip()

    if not curso:
        return JsonResponse({"alumnos": []})

    curso_doc = _mongo_db["cursos"].find_one({"nombre": curso})
    if not curso_doc:
        return JsonResponse({"error": "Curso no encontrado"}, status=404)

    es_staff_sesion = any(r in ("Admin", "Preceptor", "Profesor") for r in roles)

    if "Alumno" in roles and not es_staff_sesion:
        # Un alumno puro solo ve su propio registro, y solo en SU curso.
        if curso != (usuario_doc.get("Curso") or ""):
            return JsonResponse({"error": "No tenés autorización para acceder a los alumnos de este curso."}, status=403)
        return JsonResponse({"alumnos": [
            {
                "nombre": f"{usuario_doc.get('Nombres', '')} {usuario_doc.get('Apellido', '')}".strip(),
                "gmail": usuario_doc.get("Gmail", ""),
            }
        ]})

    # Si se envía un ID de asignación, validar que el usuario la posea y que
    # el curso coincida.  Esto evita mezclar contexto entre asignaciones del
    # mismo curso.
    if asignacion_id:
        ok, asignacion = _puede_acceder_asignacion(gmail_sesion, asignacion_id)
        if not ok:
            return JsonResponse({"error": "No tenés autorización para acceder a esa asignación."}, status=403)
        if asignacion["curso"] != curso:
            return JsonResponse({"error": "La asignación no corresponde a ese curso."}, status=403)
    else:
        if not puede_acceder_alumnos_curso(gmail_sesion, curso):
            return JsonResponse({"error": "No tenés autorización para acceder a los alumnos de este curso."}, status=403)

    alumnos_docs = _mongo_db["usuarios"].find(
        {"Curso": curso, "Rol": "Alumno", "estado": {"$ne": "Baja"}}
    )
    alumnos = [
        {
            "nombre": f"{a.get('Nombres', '')} {a.get('Apellido', '')}".strip(),
            "gmail": a.get("Gmail", ""),
        }
        for a in alumnos_docs
    ]
    return JsonResponse({"alumnos": alumnos})


def _alumnos_activos(curso):
    """Alumnos inscriptos en el curso, en orden alfabético.

    Es la misma fuente que usa la asistencia: 'Baja' no cuenta porque un
    alumno dado de baja no debe recibir comunicados.
    """
    docs = _mongo_db["usuarios"].find(
        {"Curso": curso, "Rol": "Alumno", "estado": {"$ne": "Baja"}}
    )
    alumnos = [
        (a.get("Gmail", ""), f"{a.get('Nombres', '')} {a.get('Apellido', '')}".strip())
        for a in docs
    ]
    alumnos = [(g, n or g) for g, n in alumnos if g]
    alumnos.sort(key=lambda par: _sin_acentos(par[1]).lower())
    return alumnos


def _sin_acentos(texto):
    """Para ordenar y buscar sin que 'Núñez' quede junto a 'Nunez' fuera de orden."""
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", texto or "")
        if unicodedata.category(c) != "Mn"
    )


def _resolver_destinatarios(curso, data):
    """Decide a quién va la nota y devuelve (ok, resultado_o_error).

    Acepta las dos formas que manda el frontend:

    * ``destinatarios: [gmail, ...]`` -> selección múltiple (lo nuevo).
    * ``destinatario: "curso" | gmail``  -> la forma anterior, sigue_ando.

    Devuelve ``(gmail_alumno, lista, es_curso_completo)``:

    * un solo alumno  -> ``(gmail, [gmail], False)``; se guarda como nota
      individual, igual que antes.
    * varios, pero todos -> ``(None, None, True)``; equivale a "todo el curso",
      así que un alumno que se sume después también la ve.
    * varios del curso, no todos -> ``(None, [gmail, ...], False)``; queda
      una lista explícita y el servidor es el que decide quién la puede ver.
    """
    lista_cruda = data.get("destinatarios")
    if lista_cruda is None:
        # Forma antigua: un destinatario o la palabra "curso".
        uno = (data.get("destinatario") or "curso").strip()
        if uno == "curso":
            return True, (None, None, True)
        if not alumno_de_curso(uno, curso):
            return False, "El alumno destinatario no pertenece a ese curso"
        return True, (uno, [uno], False)

    if not isinstance(lista_cruda, list):
        return False, "Destinatarios inválidos"

    # Se limpian duplicados y espacios, y se conserva el orden de la lista.
    pedidos, vistos = [], set()
    for item in lista_cruda:
        gmail = (item or "").strip() if isinstance(item, str) else ""
        if gmail and gmail not in vistos:
            vistos.add(gmail)
            pedidos.append(gmail)

    if not pedidos:
        return False, "Elegí al menos un alumno destinatario"

    inscriptos = {g for g, _ in _alumnos_activos(curso)}
    for gmail in pedidos:
        # No alcanza con que exista: tiene que estar en ESTE curso. Sin esto se
        # podría colar un alumno de otro curso en la nota.
        if gmail not in inscriptos and not alumno_de_curso(gmail, curso):
            return False, "Uno de los alumnos destinatarios no pertenece a ese curso"

    if len(pedidos) == 1:
        return True, (pedidos[0], pedidos, False)
    if inscriptos and set(pedidos) >= inscriptos:
        return True, (None, None, True)
    return True, (None, pedidos, False)


def _destino_texto(nota, nombres_por_gmail=None):
    """Texto legible de a quién fue la nota, para el historial y el admin."""
    curso = nota.get("Curso", "")
    gmail = nota.get("AlumnoGmail")
    if gmail:
        if nombres_por_gmail and gmail in nombres_por_gmail:
            return nombres_por_gmail[gmail]
        doc = _mongo_db["usuarios"].find_one({"Gmail": gmail})
        if doc:
            return f"{doc.get('Nombres', '')} {doc.get('Apellido', '')}".strip() or gmail
        return gmail
    lista = nota.get("alumnos") or []
    if lista:
        return f"{len(lista)} alumnos de {curso}".strip()
    return f"Todo {curso}".strip()


@require_POST
def api_crear_nota(request):
    """POST /api/notas/crear/ -> guarda una nota en Mongo (colección 'notas').

    Solo staff (Profesor / Preceptor / Admin). El rol que se guarda lo
    define el SERVIDOR a partir de la sesión; el "autorRol" que mande el
    navegador se ignora. El tipo de nota se valida contra una whitelist.

    La nota puede ir a un alumno, a varios del curso o a todo el curso: se
    manda ``destinatarios: [gmail, ...]`` y el servidor decide la forma en
    que se guarda (ver ``_resolver_destinatarios``). La cantidad de alumnos
    NO la decide el navegador: se compara con los inscriptos reales.

    Si se envía ``asignacionId``, se valida que pertenezca al usuario y
    se almacena en la nota para trazabilidad del contexto.
    """
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    usuario_doc = _get_usuario_doc(gmail_sesion)
    roles = _get_roles(usuario_doc)
    if not any(r in ("Profesor", "Preceptor", "Admin") for r in roles):
        return JsonResponse({"error": "No autorizado"}, status=403)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    TIPOS_VALIDOS = {"comunicado", "amonestacion", "citacion", "felicitacion"}
    MAX_TITULO = 200
    MAX_CONTENIDO = 5000

    curso = (data.get("curso") or "").strip()
    tipo = (data.get("tipo") or "").strip().lower()
    titulo = (data.get("titulo") or "").strip()
    contenido = (data.get("contenido") or "").strip()
    requiere_pin = bool(data.get("requierePin"))
    asignacion_id = (data.get("asignacionId") or "").strip()

    if not curso or not tipo or not titulo or not contenido:
        return JsonResponse({"error": "Faltan campos obligatorios"}, status=400)
    if tipo not in TIPOS_VALIDOS:
        return JsonResponse({"error": "Tipo de nota no válido"}, status=400)
    if len(titulo) > MAX_TITULO or len(contenido) > MAX_CONTENIDO:
        return JsonResponse({"error": "El título o el contenido excede el largo permitido"}, status=400)

    curso_doc = _mongo_db["cursos"].find_one({"nombre": curso})
    if not curso_doc:
        return JsonResponse({"error": "Curso no válido"}, status=400)

    # Si se envía asignación, validar que pertenezca al usuario y que el
    # curso coincida.  Esto evita que se envíe una nota en contexto equivocado.
    asignacion_info = None
    if asignacion_id:
        ok, asignacion_info = _puede_acceder_asignacion(gmail_sesion, asignacion_id)
        if not ok:
            return JsonResponse({"error": "No tenés autorización para esa asignación"}, status=403)
        if asignacion_info["curso"] != curso:
            return JsonResponse({"error": "La asignación no corresponde a ese curso"}, status=403)
    else:
        if not puede_acceder_alumnos_curso(gmail_sesion, curso):
            return JsonResponse({"error": "No tenés autorización para enviar notas a ese curso"}, status=403)

    ok_dest, resultado = _resolver_destinatarios(curso, data)
    if not ok_dest:
        return JsonResponse({"error": resultado}, status=400)
    alumno_gmail, alumnos_lista, es_curso = resultado

    autor_nombre = (
        f"{usuario_doc.get('Nombres', '')} {usuario_doc.get('Apellido', '')}".strip()
        if usuario_doc else gmail_sesion
    )
    # El rol lo pone el servidor, no el navegador.
    autor_rol = " / ".join(roles)

    nota = {
        "Curso": curso,
        "AlumnoGmail": alumno_gmail,
        "Tipo": tipo,
        "Titulo": titulo,
        "Contenido": contenido,
        "Autor": autor_nombre,
        "AutorGmail": gmail_sesion,
        "AutorRol": autor_rol,
        "Fecha": datetime.now().isoformat(),
        "Leida": False,
    }
    # `alumnos` se guarda solo cuando la nota va a un subconjunto del curso.
    # Si va a todo el curso (o a uno solo) alcanza con AlumnoGmail, y así se
    # mantiene el comportamiento de las notas viejas.
    if alumnos_lista and not es_curso and alumno_gmail is None:
        nota["alumnos"] = alumnos_lista
    if asignacion_id:
        nota["AsignacionId"] = asignacion_id
        if asignacion_info:
            nota["AsignacionMateria"] = asignacion_info.get("materia")
            nota["AsignacionCurso"] = asignacion_info.get("curso")
    if requiere_pin:
        nota["requierePin"] = True
        nota["pinResponsable"] = ""
        nota["firmas"] = []
        if es_curso:
            nota["alumnos"] = [g for g, _ in _alumnos_activos(curso)]
    # No hay un PIN de respuesta: para escribirle al autor se usa el mismo PIN
    # del alumno que confirma las notas (`pinResponsable`). Quien envía la nota
    # no define ninguna credencial.
    _mongo_db["notas"].insert_one(nota)

    # Cuántos alumnos van a ver la nota, para el mensaje de confirmación.
    inscriptos = len(_alumnos_activos(curso))
    if es_curso:
        alcance = f"todo el curso ({inscriptos} alumnos)"
    elif alumno_gmail:
        alcance = "1 alumno"
    else:
        alcance = f"{len(alumnos_lista)} alumnos"
    log_accion(request, "Nota creada", f"{tipo} -> {curso} ({alcance})", usuario=gmail_sesion)

    return JsonResponse({
        "ok": True,
        "id": str(nota.get("_id", "")) or None,
        "destinatarios": alcance,
    })


@require_POST
def api_confirmar_nota(request):
    """POST /api/notas/confirmar/ -> el alumno ingresa el PIN para confirmar una nota.
    El PIN se busca en la colección 'usuarios' del alumno logueado."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    nota_id = (data.get("notaId") or "").strip()
    pin_ingresado = (data.get("pin") or "").strip()

    if not nota_id or not pin_ingresado:
        return JsonResponse({"error": "Faltan datos"}, status=400)

    from bson import ObjectId
    try:
        nota_doc = _mongo_db["notas"].find_one({"_id": ObjectId(nota_id)})
    except Exception:
        return JsonResponse({"error": "Nota no válida"}, status=400)

    if not nota_doc:
        return JsonResponse({"error": "Nota no encontrada"}, status=404)

    # Buscar el PIN hasheado en la colección 'usuarios' del alumno logueado
    usuario_doc = _mongo_db["usuarios"].find_one({"Gmail": gmail_sesion})
    if not usuario_doc:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    # Sólo puede confirmar una nota que le corresponda: a él directamente, a un
    # grupo del que forma parte, o a todo su curso. La regla vive en
    # `auth.nota_corresponde_a`, compartida con las respuestas, para que las
    # dos no puedan divergir y dejar una vía libre.
    if not nota_corresponde_a(gmail_sesion, nota_doc, usuario_doc):
        return JsonResponse({"error": "Esta nota no te corresponde"}, status=403)

    pin_hash = usuario_doc.get("pinResponsable", "")
    if not pin_hash:
        return JsonResponse({"ok": False, "error": "No tenés PIN configurado"}, status=400)

    # Lockout: 5 fallos de PIN bloquean el PIN de la cuenta.
    fallidos = int(usuario_doc.get("pin_intentos_fallidos") or 0)
    if fallidos >= 5 or not usuario_doc.get("pin_habilitado", True):
        return JsonResponse(
            {"ok": False, "error": "PIN bloqueado por demasiados intentos. Comunicate con la institución."},
            status=429,
        )

    # Rate limit por IP para frenar fuerza bruta distribuida.
    permitido_ip, _ = pin_limite_ip(request)
    if not permitido_ip:
        return JsonResponse(
            {"ok": False, "error": "Demasiados intentos de PIN. Probá más tarde."},
            status=429,
        )

    coincide = verificar_pin(pin_ingresado, pin_hash)

    if coincide:
        ahora = datetime.now().isoformat()
        # La firma de este alumno se suma a la lista de firmas de la nota.
        # Cada alumno firma por separado; la nota recién queda "confirmada"
        # cuando firmaron TODOS los alumnos del curso.
        _mongo_db["notas"].update_one(
            {"_id": nota_doc["_id"]},
            {"$addToSet": {"firmas": gmail_sesion}},
        )
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_sesion},
            {"$set": {"pin_ultimo_uso": ahora, "pin_intentos_fallidos": 0}},
        )

        nota_actual = _mongo_db["notas"].find_one({"_id": nota_doc["_id"]})
        alumnos = nota_actual.get("alumnos") or []
        firmas = list(nota_actual.get("firmas") or [])
        # En una nota a todo el curso, todos firmaron cuando el conjunto de
        # firmas cubre la lista de alumnos que debían firmar.
        todos_firmaron = bool(alumnos) and set(firmas).issuperset(set(alumnos))

        # Si es una nota directa (un solo alumno) o ya firmaron todos,
        # la nota queda confirmada.
        if not alumnos or todos_firmaron:
            _mongo_db["notas"].update_one(
                {"_id": nota_doc["_id"]},
                {"$set": {
                    "confirmada": True,
                    "confirmadaFecha": ahora,
                    "confirmadaPor": gmail_sesion,
                    "todosFirmaron": True,
                }},
            )
        log_accion(request, "Nota confirmada por PIN", str(nota_doc["_id"]), usuario=gmail_sesion)
        return JsonResponse({"ok": True, "confirmada": True})
    else:
        fallidos += 1
        campos = {"pin_intentos_fallidos": fallidos}
        if fallidos >= 5:
            campos["pin_habilitado"] = False
            log_accion(request, "PIN bloqueado por fallos", gmail_sesion, usuario=gmail_sesion)
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_sesion},
            {"$set": campos},
        )
        log_accion(request, "PIN incorrecto", gmail_sesion, usuario=gmail_sesion)
        if fallidos >= 5:
            return JsonResponse(
                {"ok": False, "error": "PIN bloqueado por demasiados intentos. Comunicate con la institución."},
                status=429,
            )
        return JsonResponse({"ok": False, "error": "PIN incorrecto"}, status=400)


@require_POST
def api_editar_nota(request):
    """POST /api/notas/editar/ -> el AUTOR corrige el texto de una nota que él envió.

    Existe porque una nota a varios alumnos se escribe una sola vez: si el
    docente se equivoca en el título o el cuerpo, lo corrige acá una vez y
    todos los que la reciben ven la versión buena, en lugar de tener que
    borrarla y reenviarla (que genera el aviso duplicado que se quería evitar).

    Sólo el autor puede editar, y sólo mientras NADIE la haya firmado con PIN:
    en cuanto un alumno firmanó que leyó un texto, ese texto ya no se puede
    cambiar por otro distinto.
    """
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    nota_id = (data.get("id") or "").strip()
    titulo = (data.get("titulo") or "").strip()
    contenido = (data.get("contenido") or "").strip()

    if not nota_id:
        return JsonResponse({"error": "Falta el identificador de la nota"}, status=400)
    if not titulo or not contenido:
        return JsonResponse({"error": "El título y el contenido no pueden quedar vacíos"}, status=400)
    if len(titulo) > 200 or len(contenido) > 5000:
        return JsonResponse({"error": "El título o el contenido excede el largo permitido"}, status=400)

    from bson import ObjectId
    try:
        nota = _mongo_db["notas"].find_one({"_id": ObjectId(nota_id)})
    except Exception:
        return JsonResponse({"error": "Nota no válida"}, status=400)
    if not nota:
        return JsonResponse({"error": "Nota no encontrada"}, status=404)

    # El autor es el único que puede corregirla, y no si está en la papelera.
    if nota.get("AutorGmail") != gmail_sesion:
        return JsonResponse({"error": "Sólo podés editar las notas que enviaste"}, status=403)
    if nota.get("eliminada"):
        return JsonResponse({"error": "La nota está en la papelera"}, status=400)

    firmas = list(nota.get("firmas") or [])
    if firmas:
        return JsonResponse({
            "error": "La nota ya fue firmada por al menos un alumno, así que el "
                     "texto no se puede cambiar. Enviá una nota nueva."
        }, status=400)

    ahora = datetime.now().isoformat()
    _mongo_db["notas"].update_one(
        {"_id": nota["_id"]},
        {"$set": {
            "Titulo": titulo,
            "Contenido": contenido,
            "editada": True,
            "editadaFecha": ahora,
            "editadaPor": gmail_sesion,
        }},
    )
    log_accion(request, "Nota editada", f"{nota.get('Tipo')} -> {nota.get('Curso')}",
               usuario=gmail_sesion)
    # Se devuelven los textos ya guardados para que la vista no tenga que
    # adivinar qué se persistió.
    return JsonResponse({"ok": True, "titulo": titulo, "contenido": contenido})


@require_GET
def api_notas_enviadas(request):
    """GET /api/notas/enviadas/ -> notas enviadas por el usuario logueado,
    con el estado de confirmación del PIN por parte del alumno."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    docs = _mongo_db["notas"].find({"AutorGmail": gmail_sesion}).sort("Fecha", -1)

    notas = []
    for d in docs:
        curso = d.get("Curso", "")
        # Nombres de los alumnos del grupo, para el texto de destino.
        grupo = d.get("alumnos") or []
        nombres_por_gmail = {}
        if grupo:
            for a in _mongo_db["usuarios"].find({"Gmail": {"$in": grupo}}):
                g = a.get("Gmail", "")
                nombres_por_gmail[g] = f"{a.get('Nombres', '')} {a.get('Apellido', '')}".strip() or g
        destinatario = _destino_texto(d, nombres_por_gmail)

        firmados = []
        sin_firmar = []
        requiere = bool(d.get("requierePin"))
        # El alcance (cuántos alumnos) se muestra siempre; el desglose de
        # firmas tiene sentido solo cuando se pidió PIN.
        cantidad_alumnos = len(grupo)
        if grupo and requiere:
            firmas = set(d.get("firmas") or [])
            firmados = [nombres_por_gmail.get(g, g) for g in grupo if g in firmas]
            sin_firmar = [nombres_por_gmail.get(g, g) for g in grupo if g not in firmas]

        notas.append({
            "id": str(d.get("_id")),
            "tipo": d.get("Tipo", "comunicado"),
            "titulo": d.get("Titulo", ""),
            "contenido": d.get("Contenido", ""),
            "autor": d.get("Autor", ""),
            "autorRol": d.get("AutorRol", ""),
            "fecha": d.get("Fecha", ""),
            "editada": bool(d.get("editada", False)),
            "leida": bool(d.get("confirmada", False)),
            "requierePin": requiere,
            "confirmada": bool(d.get("confirmada", False)),
            "todosFirmaron": bool(d.get("todosFirmaron", False)),
            "firmados": firmados,
            "sinFirmar": sin_firmar,
            "cantidadAlumnos": cantidad_alumnos,
            "destino": destinatario,
            # Para que la interfaz muestre a quiénes les llegó.
            "destinatarios": (
                [nombres_por_gmail.get(g, g) for g in grupo] if grupo else [destinatario]
            ),
        })
    return JsonResponse({"notas": notas})


@require_GET
def api_cursos(request):
    """GET /api/cursos/ -> lista de todos los cursos (para el selector)."""
    if not request.session.get('usuario_gmail'):
        return JsonResponse({"error": "No autenticado"}, status=401)

    cursos_docs = _mongo_db["cursos"].find({}, {"nombre": 1})
    cursos = sorted([c["nombre"] for c in cursos_docs if c.get("nombre")])
    return JsonResponse({"cursos": cursos})


@require_GET
def api_horario_curso(request):
    """GET /api/horarios/?curso=7A -> el horario de ESE curso puntual
    (no necesariamente el del usuario logueado, para que el preceptor
    pueda mirar/editar el horario de cualquier curso)."""
    if not request.session.get('usuario_gmail'):
        return JsonResponse({"error": "No autenticado"}, status=401)

    curso = request.GET.get('curso', '').strip()
    return JsonResponse({"dias": _get_horario(curso) if curso else {}})


@require_POST
def api_guardar_horario(request):
    """POST /api/horarios/guardar/ -> guarda el horario de un curso,
    pero SOLO si la persona logueada es Preceptor de ESE curso puntual
    (no de cualquier curso, ni siquiera si es Profesor en otro)."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    usuario_doc = _get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return JsonResponse({"error": "No autorizado"}, status=403)

    asignaciones = _get_asignaciones(usuario_doc["_id"])
    # Las asignaciones de Preceptor son las que NO tienen materia.
    cursos_a_cargo = {a["curso"] for a in asignaciones if not a.get("materia")}

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    curso = (data.get("curso") or "").strip()
    dias = data.get("dias")

    if curso not in cursos_a_cargo:
        return JsonResponse({"error": "No sos preceptor de ese curso"}, status=403)
    if not isinstance(dias, dict):
        return JsonResponse({"error": "Faltan datos"}, status=400)

    _mongo_db["horarios"].update_one(
        {"Curso": curso},
        {"$set": {"Curso": curso, "Dias": dias}},
        upsert=True,
    )
    return JsonResponse({"ok": True})
def _fila_vacia(i):
    return {
        "fila": i,
        "fecha": "",
        "detalle": "",
        "firmaDocente": "",
        "firmaPadre": "",
    }


# Períodos de la planilla: 1° y 2° cuatrimestre + mesas de diciembre,
# febrero y marzo. Se guardan como números para mantener compatibilidad
# con las calificaciones ya cargadas.
PERIODOS_VALIDOS = (1, 2, 3, 4, 5)
PERIODOS_PLANILLA = ("1", "2", "3", "4", "5")
MAX_FILAS_PLANILLA = 100


def _periodo_vacio():
    return {"filas": [_fila_vacia(i) for i in range(1, 8)], "notaFinal": ""}


def _planilla_vacia():
    return {periodo: _periodo_vacio() for periodo in PERIODOS_PLANILLA}


@require_GET
def api_materias_por_curso(request):
    """GET /api/materias-por-curso/?curso=7A -> lista de materias que se dictan
    en ese curso, con el nombre del profesor que la dicta."""
    if not request.session.get('usuario_gmail'):
        return JsonResponse({"error": "No autenticado"}, status=401)

    curso_nombre = request.GET.get('curso', '').strip()
    if not curso_nombre:
        return JsonResponse({"materias": []})

    curso_doc = _mongo_db["cursos"].find_one({"nombre": curso_nombre})
    if not curso_doc:
        return JsonResponse({"materias": []})

    asignaciones = _mongo_db["asignaciones"].find({
        "curso_id": curso_doc["_id"],
        "materia": {"$ne": None, "$exists": True},
    })

    materias_map = {}
    for a in asignaciones:
        materia = a.get("materia")
        if not materia:
            continue
        usuario_doc = _mongo_db["usuarios"].find_one({"_id": a.get("usuario_id")})
        profesor_nombre = ""
        if usuario_doc:
            profesor_nombre = f"{usuario_doc.get('Nombres', '')} {usuario_doc.get('Apellido', '')}".strip()
        materias_map[materia] = profesor_nombre

    materias = [{"nombre": m, "profesor": p} for m, p in sorted(materias_map.items())]
    return JsonResponse({"materias": materias})


@require_GET
def api_calificaciones_alumno(request):
    """GET /api/calificaciones/?curso=7A&materia=Base de Datos&alumno=gmail
    -> la planilla del alumno en esa materia/curso: 7 filas por
    cuatrimestre con fecha, detalle, firma del docente y firma del
    padre (PIN), más la calificación final de cada cuatrimestre.

    Autorización: el alumno solo ve sus propias calificaciones; staff
    (Admin / Preceptor del curso / Profesor de esa materia).
    """
    gmail_sesion, err = autenticar(request)
    if err:
        return err

    curso = request.GET.get('curso', '').strip()
    materia = request.GET.get('materia', '').strip()
    alumno_gmail = request.GET.get('alumno', '').strip()
    if not (curso and materia and alumno_gmail):
        return JsonResponse({"cuatrimestres": _planilla_vacia()})

    if not can_acceder_alumno(gmail_sesion, alumno_gmail, curso, materia):
        return JsonResponse({"error": "No tenés permiso para ver las calificaciones de ese alumno"}, status=403)
    if not alumno_de_curso(alumno_gmail, curso):
        return JsonResponse({"error": "El alumno no pertenece a ese curso"}, status=400)

    planilla = _planilla_vacia()
    docs = _mongo_db["calificaciones"].find({
        "Curso": curso, "Materia": materia, "AlumnoGmail": alumno_gmail,
    })

    for d in docs:
        cuatrimestre = str(d.get("Cuatrimestre"))
        if cuatrimestre not in planilla:
            continue
        if d.get("Tipo") == "final":
            planilla[cuatrimestre]["notaFinal"] = d.get("Nota", "")
            continue
        fila = d.get("Fila")
        if not isinstance(fila, int) or fila < 1 or fila > MAX_FILAS_PLANILLA:
            continue
        filas = planilla[cuatrimestre]["filas"]
        while len(filas) < fila:
            filas.append(_fila_vacia(len(filas) + 1))
        fila_doc = filas[fila - 1]
        fila_doc["fecha"] = d.get("Fecha", "")
        fila_doc["detalle"] = d.get("Detalle", "")
        fila_doc["firmaDocente"] = d.get("FirmaDocente", "")
        fila_doc["firmaPadre"] = d.get("FirmaPadre", "")

    return JsonResponse({"cuatrimestres": planilla})


@require_POST
def api_guardar_calificacion(request):
    """POST /api/calificaciones/guardar/ -> guarda UNA fila de la
    planilla (fecha + detalle) para un alumno. Solo lo puede hacer un
    Profesor que dicte esa materia en ese curso. La firma del docente
    la pone el SERVIDOR con el nombre real de quien está logueado — no
    se puede mandar una firma falsa desde el navegador."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    usuario_doc = _get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return JsonResponse({"error": "No autorizado"}, status=403)

    asignaciones = _get_asignaciones(usuario_doc["_id"])
    cursos_materias = {(a["curso"], a["materia"]) for a in asignaciones if a.get("materia")}

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    curso = (data.get("curso") or "").strip()
    materia = (data.get("materia") or "").strip()
    alumno_gmail = (data.get("alumnoGmail") or "").strip()
    cuatrimestre = data.get("cuatrimestre")
    fila = data.get("fila")
    fecha = (data.get("fecha") or "").strip()
    detalle = (data.get("detalle") or "").strip()

    if (curso, materia) not in cursos_materias:
        return JsonResponse({"error": "No das esa materia en ese curso"}, status=403)
    if not (alumno_gmail and cuatrimestre in PERIODOS_VALIDOS):
        return JsonResponse({"error": "Faltan datos"}, status=400)
    if not alumno_de_curso(alumno_gmail, curso):
        return JsonResponse({"error": "El alumno no pertenece a ese curso"}, status=400)
    if not isinstance(fila, int) or fila < 1 or fila > MAX_FILAS_PLANILLA:
        return JsonResponse({"error": "Fila inválida"}, status=400)

    firma = f"Prof. {usuario_doc.get('Nombres', '')} {usuario_doc.get('Apellido', '')}".strip()

    _mongo_db["calificaciones"].update_one(
        {
            "Curso": curso, "Materia": materia, "AlumnoGmail": alumno_gmail,
            "Cuatrimestre": cuatrimestre, "Fila": fila,
        },
        {"$set": {"Fecha": fecha, "Detalle": detalle, "FirmaDocente": firma}},
        upsert=True,
    )
    return JsonResponse({"ok": True, "firmaDocente": firma})


@require_POST
def api_guardar_nota_final(request):
    """POST /api/calificaciones/final/ -> guarda la CALIFICACIÓN FINAL
    de un cuatrimestre. Solo puede cargarla un Profesor que dicte esa
    materia en ese curso."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    usuario_doc = _get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return JsonResponse({"error": "No autorizado"}, status=403)

    asignaciones = _get_asignaciones(usuario_doc["_id"])
    cursos_materias = {(a["curso"], a["materia"]) for a in asignaciones if a.get("materia")}

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    curso = (data.get("curso") or "").strip()
    materia = (data.get("materia") or "").strip()
    alumno_gmail = (data.get("alumnoGmail") or "").strip()
    cuatrimestre = data.get("cuatrimestre")
    nota = (data.get("nota") or "").strip()

    if (curso, materia) not in cursos_materias:
        return JsonResponse({"error": "No das esa materia en ese curso"}, status=403)
    if not (alumno_gmail and cuatrimestre in PERIODOS_VALIDOS):
        return JsonResponse({"error": "Faltan datos"}, status=400)
    if not alumno_de_curso(alumno_gmail, curso):
        return JsonResponse({"error": "El alumno no pertenece a ese curso"}, status=400)

    _mongo_db["calificaciones"].update_one(
        {
            "Curso": curso, "Materia": materia, "AlumnoGmail": alumno_gmail,
            "Cuatrimestre": cuatrimestre, "Tipo": "final",
        },
        {"$set": {"Nota": nota}},
        upsert=True,
    )
    return JsonResponse({"ok": True})


@require_POST
def api_firmar_calificacion(request):
    """POST /api/calificaciones/firmar/ -> el alumno (o su responsable)
    firma una fila de su propia planilla ingresando el PIN del
    responsable. El PIN se busca en la colección 'usuarios' del alumno
    logueado."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    curso = (data.get("curso") or "").strip()
    materia = (data.get("materia") or "").strip()
    cuatrimestre = data.get("cuatrimestre")
    fila = data.get("fila")
    pin_ingresado = (data.get("pin") or "").strip()

    if not (curso and materia and cuatrimestre in PERIODOS_VALIDOS and pin_ingresado):
        return JsonResponse({"error": "Faltan datos"}, status=400)
    if not isinstance(fila, int) or fila < 1 or fila > MAX_FILAS_PLANILLA:
        return JsonResponse({"error": "Fila inválida"}, status=400)

    # Solo se puede firmar una calificación que YA cargó el docente:
    # tiene que existir una fila con fecha, detalle y firma del docente.
    # Sin eso no hay nada que firmar (y no se crea la fila por accidente).
    doc_calif = _mongo_db["calificaciones"].find_one({
        "Curso": curso, "Materia": materia, "AlumnoGmail": gmail_sesion,
        "Cuatrimestre": cuatrimestre, "Fila": fila,
    })
    if (
        not doc_calif
        or not (doc_calif.get("Fecha") or "").strip()
        or not (doc_calif.get("Detalle") or "").strip()
        or not (doc_calif.get("FirmaDocente") or "").strip()
    ):
        return JsonResponse(
            {"ok": False, "error": "El docente todavía no cargó esta calificación (fecha, detalle y firma docente)."},
            status=400,
        )

    usuario_doc = _mongo_db["usuarios"].find_one({"Gmail": gmail_sesion})
    if not usuario_doc:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    pin_hash = usuario_doc.get("pinResponsable", "")
    if not pin_hash:
        return JsonResponse({"ok": False, "error": "No tenés PIN configurado"}, status=400)

    # Lockout: 5 fallos de PIN bloquean el PIN de la cuenta.
    fallidos = int(usuario_doc.get("pin_intentos_fallidos") or 0)
    if fallidos >= 5 or not usuario_doc.get("pin_habilitado", True):
        return JsonResponse(
            {"ok": False, "error": "PIN bloqueado por demasiados intentos. Comunicate con la institución."},
            status=429,
        )

    # Rate limit por IP.
    permitido_ip, _ = pin_limite_ip(request)
    if not permitido_ip:
        return JsonResponse(
            {"ok": False, "error": "Demasiados intentos de PIN. Probá más tarde."},
            status=429,
        )

    coincide = verificar_pin(pin_ingresado, pin_hash)

    if not coincide:
        fallidos += 1
        campos = {"pin_intentos_fallidos": fallidos}
        if fallidos >= 5:
            campos["pin_habilitado"] = False
            log_accion(request, "PIN bloqueado por fallos", gmail_sesion, usuario=gmail_sesion)
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_sesion},
            {"$set": campos},
        )
        log_accion(request, "PIN incorrecto", gmail_sesion, usuario=gmail_sesion)
        if fallidos >= 5:
            return JsonResponse(
                {"ok": False, "error": "PIN bloqueado por demasiados intentos. Comunicate con la institución."},
                status=429,
            )
        return JsonResponse({"ok": False, "error": "PIN incorrecto"}, status=400)

    firma_fecha = date.today().isoformat()
    _mongo_db["calificaciones"].update_one(
        {
            "Curso": curso, "Materia": materia, "AlumnoGmail": gmail_sesion,
            "Cuatrimestre": cuatrimestre, "Fila": fila,
        },
        {"$set": {"FirmaPadre": firma_fecha}},
    )
    _mongo_db["usuarios"].update_one(
        {"Gmail": gmail_sesion},
        {"$set": {"pin_ultimo_uso": datetime.now().isoformat(), "pin_intentos_fallidos": 0}},
    )
    log_accion(request, "Calificación firmada por PIN", f"{curso} {materia} fila {fila}", usuario=gmail_sesion)
    return JsonResponse({"ok": True, "firmaPadre": firma_fecha})


@require_POST
def api_eliminar_calificacion(request):
    """POST /api/calificaciones/eliminar/ -> elimina una calificación (fila) de un alumno."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    usuario_doc = _get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return JsonResponse({"error": "No autorizado"}, status=403)

    asignaciones = _get_asignaciones(usuario_doc["_id"])
    cursos_materias = {(a["curso"], a["materia"]) for a in asignaciones if a.get("materia")}

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    curso = (data.get("curso") or "").strip()
    materia = (data.get("materia") or "").strip()
    alumno_gmail = (data.get("alumnoGmail") or "").strip()
    cuatrimestre = data.get("cuatrimestre")
    fila = data.get("fila")

    if (curso, materia) not in cursos_materias:
        return JsonResponse({"error": "No das esa materia en ese curso"}, status=403)
    if not (alumno_gmail and cuatrimestre in PERIODOS_VALIDOS):
        return JsonResponse({"error": "Faltan datos"}, status=400)
    if not isinstance(fila, int) or fila < 1 or fila > MAX_FILAS_PLANILLA:
        return JsonResponse({"error": "Fila inválida"}, status=400)

    _mongo_db["calificaciones"].delete_one({
        "Curso": curso, "Materia": materia, "AlumnoGmail": alumno_gmail,
        "Cuatrimestre": cuatrimestre, "Fila": fila,
    })
    log_accion(request, "Calificación eliminada", f"{curso} {materia} fila {fila}", usuario=gmail_sesion)
    return JsonResponse({"ok": True})


@require_POST
def api_cambiar_contrasena(request):
    """POST /api/cambiar-contrasena/ -> valida la contraseña actual,
    hashea la nueva con bcrypt y la guarda en MongoDB."""
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return JsonResponse({"error": "No autenticado"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    actual = (data.get("actual") or "").strip()
    nueva = (data.get("nueva") or "").strip()
    repetir = (data.get("repetir") or "").strip()

    if not actual or not nueva:
        return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)
    if nueva != repetir:
        return JsonResponse({"error": "Las contraseñas nuevas no coinciden"}, status=400)
    ok, msg = validar_password(nueva)
    if not ok:
        return JsonResponse({"error": msg}, status=400)

    # Rate limit para no convertir esto en un oráculo de contraseñas.
    permitido, _ = rate_limitar(f"cambiar_contrasena:{gmail_sesion}", 5, 900, registrar=False)
    if not permitido:
        return JsonResponse(
            {"error": "Demasiados intentos. Probá más tarde."},
            status=429,
        )

    usuario_doc = _mongo_db["usuarios"].find_one({"Gmail": gmail_sesion})
    if not usuario_doc:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    hash_actual = usuario_doc.get("Contraseña", "")
    if not verificar_contrasena(actual, hash_actual):
        rate_limitar(f"cambiar_contrasena:{gmail_sesion}", 5, 900)
        log_accion(request, "Cambio de contraseña rechazado", gmail_sesion, usuario=gmail_sesion)
        return JsonResponse({"error": "La contraseña actual es incorrecta"}, status=400)

    nuevo_hash = bcrypt.hashpw(nueva.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    _mongo_db["usuarios"].update_one(
        {"Gmail": gmail_sesion},
        {"$set": {"Contraseña": nuevo_hash}},
    )
    limpiar_intentos(f"cambiar_contrasena:{gmail_sesion}")
    log_accion(request, "Contraseña cambiada", gmail_sesion, usuario=gmail_sesion)
    return JsonResponse({"ok": True})


def _get_horario(curso):
    """Busca en la colección 'horarios' el documento del curso del alumno
    y devuelve solo la parte de los días (o {} si no hay nada cargado)."""
    if not curso:
        return {}
    doc = _mongo_db["horarios"].find_one({"Curso": curso})
    return doc["Dias"] if doc else {}

def _usuario_estado(gmail):
    """Estado actual de una cuenta (Activo / Bloqueado / Baja), leído de
    Mongo. Para cuentas viejas sin el campo, se asume Activo."""
    doc = _get_usuario_doc(gmail)
    return (doc or {}).get("estado") or "Activo"

def _get_notas_alumno(gmail, curso):
    """Notas que le corresponden a un alumno: las que le mandaron a él
    directamente (AlumnoGmail == su gmail), las que le mandaron a un grupo
    del que forma parte (`alumnos` lo incluye) o las que le mandaron a
    TODO su curso (AlumnoGmail vacío/None, sin lista y Curso == el suyo)."""
    condiciones = [{"AlumnoGmail": gmail}]
    if curso:
        condiciones.append({"AlumnoGmail": None, "Curso": curso})

    docs = _mongo_db["notas"].find({"$or": condiciones}).sort("Fecha", -1)

    notas = []
    for d in docs:
        # Una nota con lista `alumnos` va a un subconjunto del curso: el
        # filtro de arriba la trae para todo el curso, así que se descarta
        # acá para los que no están en la lista.
        grupo = d.get("alumnos") or []
        if grupo and gmail not in grupo:
            continue

        # En una nota a todo el curso o a un grupo, la "confirmada" de cada
        # alumno es si ESE alumno ya firmó con su PIN (no si ya firmaron todos).
        firmas = d.get("firmas") or []
        confirmada_para_mi = bool(d.get("confirmada", False))
        if grupo:
            confirmada_para_mi = gmail in firmas

        notas.append({
            "id": str(d.get("_id")),
            "tipo": d.get("Tipo", "comunicado"),
            "titulo": d.get("Titulo", ""),
            "contenido": d.get("Contenido", ""),
            "autor": d.get("Autor", ""),
            "autorRol": d.get("AutorRol", ""),
            "fecha": d.get("Fecha", ""),
            "leida": bool(d.get("Leida", False)),
            "requierePin": bool(d.get("requierePin", False)),
            "confirmada": confirmada_para_mi,
            # Con este mismo PIN el alumno confirma la nota y, si lo recuerda,
            # le puede escribir a quien la envió. No hay un PIN distinto por
            # nota: el PIN es del alumno, no del mensaje.
            "puedeEscribir": True,
        })
    return notas

CURSOS_ESPECIALIDAD = {
    "1A": "Ciclo Básico",
    "1B": "Ciclo Básico",
    "2A": "Ciclo Básico",
    "2B": "Ciclo Básico",
    "3A": "Ciclo Básico",   
    "3B": "Ciclo Básico",
    "4A": "Informática",
    "4B": "Mecánica",
    "5A": "Informática",
    "5B": "Mecánica",
    "6A": "Informática",
    "6B": "Mecánica",
    "7A": "Informática",
    "7B": "Mecánica",
    # sumá acá el resto (4A, 4B, 5A, 5B) con la especialidad real de tu escuela
}

def logout_view(request):
    log_accion(request, "Logout", request.session.get('usuario_gmail', ''))
    request.session.flush()   # como usás sesión manual (no auth de Django), esto la borra
    return redirect('login')
def _react_assets():
    """Lee el manifest.json que genera `npm run build` y devuelve las rutas
    reales (con hash) del JS y CSS de React."""
    manifest_path = (
        Path(settings.BASE_DIR) / "static" / "cuaderno" / "react" / ".vite" / "manifest.json"
    )
    try:
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        entry = manifest["index.html"]
        js_path = f"cuaderno/react/{entry['file']}"
        css_paths = [f"cuaderno/react/{c}" for c in entry.get("css", [])]
        return js_path, css_paths
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        # Si no existe el build de React, devolvemos vacío (el dashboard carga sin React)
        return "", []


def login_view(request):
    if request.method == "POST":
        email_ingresado = request.POST.get('Gmail', '').strip().lower()
        pass_ingresado = request.POST.get('password', '')

        # Rate limit por IP (protege antes de tocar la base).
        permitido_ip, _ = login_limite_ip(request)
        if not permitido_ip:
            log_accion(request, "Login bloqueado por rate limit", "IP", usuario=email_ingresado)
            return render(request, 'cuaderno/login.html', {
                'error': 'Demasiados intentos. Probá de nuevo más tarde.',
            })

        # Rate limit por cuenta (5 fallos en 15 min).
        permitido_cuenta, _ = rate_limitar(
            f"login_gmail:{email_ingresado}", 5, 900, registrar=False
        )
        if not permitido_cuenta:
            log_accion(request, "Login bloqueado por intentos", email_ingresado)
            return render(request, 'cuaderno/login.html', {
                'error': 'Demasiados intentos para esta cuenta. Probá de nuevo más tarde.',
            })

        user = _buscar_usuario_mongo(email_ingresado)

        if user:
            es_correcta = verificar_contrasena(pass_ingresado, user.contrasena)
        else:
            verificar_contrasena(pass_ingresado, None)
            es_correcta = False

        if es_correcta:
            estado = _usuario_estado(user.gmail)
            if estado == "Bloqueado":
                log_accion(request, "Login denegado por estado", f"{user.gmail} (Bloqueado)")
                return render(request, 'cuaderno/login.html', {
                    'error': 'Tu cuenta se encuentra temporalmente bloqueada. Comunicate con la institución para obtener más información.',
                })
            if estado == "Baja":
                log_accion(request, "Login denegado por estado", f"{user.gmail} (Baja)")
                return render(request, 'cuaderno/login.html', {
                    'error': 'Tu cuenta está dada de baja. Comunicate con la institución para obtener más información.',
                })

            limpiar_intentos(f"login_gmail:{email_ingresado}")
            request.session.cycle_key()
            request.session['usuario_gmail'] = user.gmail
            duracion = int(get_config().get("duracion_sesion_min") or 30)
            request.session['_expira'] = (
                datetime.now() + timedelta(minutes=duracion)
            ).isoformat()
            log_accion(request, "Login exitoso", user.gmail)
            return redirect('dashboard')
        else:
            rate_limitar(f"login_gmail:{email_ingresado}", 5, 900)
            log_accion(request, "Login fallido", email_ingresado)
            return render(request, 'cuaderno/login.html', {'error': 'Credenciales incorrectas.'})

    return render(request, 'cuaderno/login.html')

@ensure_csrf_cookie

def dashboard_view(request):
    gmail_sesion = request.session.get('usuario_gmail')
    if not gmail_sesion:
        return redirect('login')

    user = _buscar_usuario_mongo(gmail_sesion)
    if not user:
        return redirect('login')

    especialidad = CURSOS_ESPECIALIDAD.get(user.curso, "")
    numero = user.curso[:-1] if user.curso else ""
    division = user.curso[-1] if user.curso else ""
    if especialidad:
        curso_legible = f"{numero}°{division} - {especialidad}"
    elif user.curso:
        curso_legible = user.curso
    else:
        curso_legible = ""

    usuario_doc = _get_usuario_doc(gmail_sesion)
    roles = _get_roles(usuario_doc)                              # <-- nuevo
    asignaciones = _get_asignaciones(usuario_doc["_id"]) if usuario_doc else []

    if usuario_doc:
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_sesion},
            {"$set": {"UltimoIngreso": datetime.now().isoformat()}},
        )

    # El curso "a cargo" (para Preceptor) es la asignación SIN materia
    # (a diferencia de las de Profesor, que siempre tienen materia).
    # Buscarlo así en vez de "la primera asignación" evita el error de
    # tomar un curso de Profesor por accidente en gente con los dos roles.
    curso_para_horario = user.curso
    if not curso_para_horario:
        asignacion_preceptor = next((a for a in asignaciones if not a.get("materia")), None)
        if asignacion_preceptor:
            curso_para_horario = asignacion_preceptor["curso"]

    horario_dias = _get_horario(curso_para_horario)
    notas_alumno = _get_notas_alumno(gmail_sesion, user.curso) if "Alumno" in roles else []
    react_js, react_css = _react_assets()

    return render(request, 'cuaderno/dashboard.html', {
        'usuario': user,
        'curso_legible': curso_legible,
        'react_js': react_js,
        'react_css': react_css,
        'horario_dias': horario_dias,
        'asignaciones': asignaciones,
        'roles': roles,                  
        'notas_alumno': notas_alumno                                                # <-- nuevo
    })