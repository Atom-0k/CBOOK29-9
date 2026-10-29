"""Réplicas a las notas. Se autorizan con el MISMO PIN que confirma las notas.

Por qué existe: una nota pide PIN para confirmarse. Si el alumno no lo tiene o
no lo recuerda, no tiene otra vía que quedarse mirando la pantalla. Acá escribe
a quien mandó la nota y ese alguien recibe el aviso.

Decisiones de diseño:

  * Hay UN SOLO PIN por alumno: `pinResponsable`, el que la institución genera
    y entrega una vez (ver `scripts/rotar_pins.py`). Ese mismo PIN confirma la
    nota y habilita escribir al autor. No hay un segundo PIN ni lo elige quien
    envía la nota: si lo eligiera el preceptor, cada nota tendría una clave
    distinta que hay que repartir por otro canal, que es justamente el
    problema que se quiere resolver.

  * Que sea el mismo PIN tiene una consecuencia deseable: el alumno que no
    puede confirmar porque no conoce su PIN tampoco puede escribir, así que no
    se abre un canal paralelo al de la confirmación. Y como la credencial es la
    misma, el bloqueo por intentos es el mismo que el de la confirmación: 5
    fallos bloquean el PIN de la cuenta, no el PIN de una nota.

  * El PIN es un hash bcrypt en el documento del alumno. Se verifica en el
    servidor en cada envío; nunca se guarda ni se devuelve en claro.

  * El mensaje se guarda en la colección `nota_mensajes` y se le avisa al autor
    por la misma cola de correo que las inasistencias (`notificaciones`), con
    otra clave de deduplicación. Así el aviso sale con el comando ya existente
    y no depende de que el servidor de correo esté arriba en el momento.

  * El autor de la nota ve la bandeja y puede responder o dar por cerrada la
    consulta. El alumno ve lo que mandó y la respuesta que le dieron, y nada
    más: no puede leer conversaciones ajenas ni las de otras notas suyas.
"""
import json
import logging
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from . import notificaciones
from .auth import (
    _mongo_db,
    get_config,
    get_roles,
    get_usuario_doc,
    log_accion,
    nota_corresponde_a,
    pin_limite_ip,
    verificar_pin,
)

logger = logging.getLogger(__name__)

COLECCION = "nota_mensajes"

MAX_MENSAJE = 1000
MAX_INTENTOS_PIN = 5


def _resp(data, status=200):
    return JsonResponse(data, status=status)


def _nombre(doc):
    return f"{doc.get('Nombres', '')} {doc.get('Apellido', '')}".strip()


def _buscar_nota(nota_id):
    """Devuelve (nota, error_json). Nunca lanza por un id inválido."""
    if not nota_id:
        return None, _resp({"error": "Falta la nota"}, status=400)
    try:
        nota = _mongo_db["notas"].find_one({"_id": ObjectId(nota_id)})
    except (InvalidId, TypeError, ValueError):
        return None, _resp({"error": "Nota no válida"}, status=400)
    if not nota:
        return None, _resp({"error": "Nota no encontrada"}, status=404)
    return nota, None


def _contexto(nota, emisor_doc, roles_emisor, texto):
    """Arma el texto del aviso.

    Se llama una sola vez por mensaje, así que la clave de deduplicación lleva
    el id del mensaje y dos mensajes distintos generan dos avisos.
    """
    emisor_nombre = _nombre(emisor_doc) or "Un alumno"
    rol = " / ".join(roles_emisor) if roles_emisor else "Alumno"
    curso = nota.get("Curso") or ""
    titulo = (nota.get("Titulo") or "").strip()
    fecha = (nota.get("Fecha") or "")[:10]
    # El aviso por correo lleva un recorte del mensaje, no el texto entero: es
    # la pantalla del Cuaderno donde se lee la conversación completa.
    resumen = texto if len(texto) <= 300 else texto[:300].rstrip() + "…"
    return {
        "emisorGmail": emisor_doc.get("Gmail") or "",
        "emisorNombre": emisor_nombre,
        "emisorRol": rol,
        "curso": curso,
        "titulo": titulo,
        "fecha": fecha,
        "asunto": f"Respuesta a tu nota de {curso}: {titulo}"[:200],
        "cuerpo": (
            f"Hola {nota.get('Autor') or ''},\n\n"
            f"{emisor_nombre} te escribió sobre la nota \"{titulo}\" "
            f"({curso}, {fecha}).\n\n"
            f"\"{resumen}\"\n\n"
            f"Entrá al Cuaderno Digital para responderle.\n\n"
            "Este mensaje se generó automáticamente."
        ),
    }


def _encolar_aviso(mensaje_id, ctx, destinatario_doc):
    """Encola el aviso al autor de la nota. Devuelve True si se encoló.

    Nunca propaga excepciones: no poder avisar no puede hacer fallar el envío
    del mensaje, que es lo que el usuario está intentando hacer.
    """
    try:
        if not notificaciones.emails_activos():
            return False
        direccion = (destinatario_doc.get("Email") or destinatario_doc.get("Gmail") or "").strip()
        if not direccion:
            return False
        _mongo_db[notificaciones.COLECCION].insert_one({
            "clave": f"nota_respuesta:{mensaje_id}",
            "tipo": "nota_respuesta",
            "para": direccion,
            "esTutor": False,
            "alumno": ctx["emisorGmail"],
            "alumnoNombre": ctx["emisorNombre"],
            "curso": ctx["curso"],
            "asunto": ctx["asunto"],
            "cuerpo": ctx["cuerpo"],
            "remitente": notificaciones._remitente(get_config()),
            "estadoEnvio": "pendiente",
            "intentos": 0,
            "creado": datetime.now().isoformat(),
            "enviado": None,
            "error": "",
        })
        return True
    except Exception:
        logger.exception("No se pudo encolar el aviso de respuesta de nota")
        return False


@require_POST
def api_responder_nota(request):
    """POST /api/notas/mensaje/ -> un destinatario escribe al autor de la nota.

    Cuerpo: {notaId, pin, mensaje}

    El `pin` es el PIN del alumno, el mismo con el que confirma las notas
    (`pinResponsable` en su documento). Es obligatorio siempre.

    Se valida antes de guardar nada: un PIN incorrecto no deja rastro en la base
    salvo el contador de intentos, para no usarlo de oráculo.
    """
    gmail_sesion = request.session.get("usuario_gmail")
    if not gmail_sesion:
        return _resp({"error": "No autenticado"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, status=400)

    nota_id = (data.get("notaId") or "").strip()
    pin = (data.get("pin") or "").strip()
    texto = (data.get("mensaje") or "").strip()

    if not pin:
        return _resp({"error": "Ingresá tu PIN para enviar el mensaje"}, status=400)
    if not texto:
        return _resp({"error": "Escribí un mensaje"}, status=400)
    if len(texto) > MAX_MENSAJE:
        return _resp({"error": "El mensaje excede el largo permitido"}, status=400)

    nota, err = _buscar_nota(nota_id)
    if err:
        return err

    # El autor de la nota no se responde a sí mismo por esta vía: para eso está
    # el endpoint de respuesta del staff.
    if nota.get("AutorGmail") == gmail_sesion:
        return _resp({"error": "Esta nota la enviaste vos"}, status=403)

    emisor_doc = get_usuario_doc(gmail_sesion)
    if not emisor_doc:
        return _resp({"error": "Usuario no encontrado"}, status=404)
    if not nota_corresponde_a(gmail_sesion, nota, emisor_doc):
        return _resp({"error": "Esta nota no te corresponde"}, status=403)

    # Verificación del PIN: es la misma credencial y el mismo bloqueo que usa
    # `views.api_confirmar_nota`. Se mantiene el orden de las comprobaciones
    # (cuenta bloqueada -> límite por IP -> comparación) para que las dos vías
    # se comporten igual y no quede una más laxa que la otra.
    pin_hash = emisor_doc.get("pinResponsable", "")
    if not pin_hash:
        return _resp({"error": "No tenés PIN configurado. Comunicate con la institución."}, status=400)

    fallidos = int(emisor_doc.get("pin_intentos_fallidos") or 0)
    if fallidos >= MAX_INTENTOS_PIN or not emisor_doc.get("pin_habilitado", True):
        return _resp(
            {"error": "PIN bloqueado por demasiados intentos. Comunicate con la institución."},
            status=429,
        )

    permitido_ip, _ = pin_limite_ip(request)
    if not permitido_ip:
        return _resp({"error": "Demasiados intentos. Probá más tarde."}, status=429)

    if not verificar_pin(pin, pin_hash):
        _mongo_db["usuarios"].update_one(
            {"Gmail": gmail_sesion},
            {"$inc": {"pin_intentos_fallidos": 1}},
        )
        log_accion(request, "PIN incorrecto al escribir al autor de la nota", str(nota["_id"]), usuario=gmail_sesion)
        return _resp({"error": "PIN incorrecto"}, status=400)

    # Acierto: se reinicia el contador, igual que al confirmar una nota.
    _mongo_db["usuarios"].update_one(
        {"Gmail": gmail_sesion},
        {"$set": {"pin_intentos_fallidos": 0}},
    )

    autor_doc = get_usuario_doc(nota.get("AutorGmail") or "") or {}
    ctx = _contexto(nota, emisor_doc, get_roles(emisor_doc), texto)
    ahora = datetime.now().isoformat()
    doc = {
        "notaId": nota["_id"],
        "notaTitulo": nota.get("Titulo") or "",
        "curso": nota.get("Curso") or "",
        "emisorGmail": gmail_sesion,
        "emisorNombre": ctx["emisorNombre"],
        "emisorRol": ctx["emisorRol"],
        "destinatarioGmail": nota.get("AutorGmail") or "",
        "mensaje": texto,
        "creado": ahora,
        "leido": False,
        "estado": "pendiente",
        "respuesta": None,
        # Queda constancia de que se verificó el PIN, sin guardar el PIN.
        "pinVerificado": True,
    }
    resultado = _mongo_db[COLECCION].insert_one(doc)
    mensaje_id = resultado.inserted_id

    avisado = _encolar_aviso(mensaje_id, ctx, autor_doc)
    log_accion(
        request, "Mensaje a nota", f"{nota.get('Curso')} · {nota.get('Titulo')}",
        usuario=gmail_sesion,
    )
    return _resp({
        "ok": True,
        "id": str(mensaje_id),
        "notificado": avisado,
        "created": ahora,
    })


@require_GET
def api_mensajes_nota(request):
    """GET /api/notas/mensajes/ -> bandeja.

    Staff: los mensajes recibidos sobre las notas que él envió.
    Alumno: los mensajes que él mandó, con la respuesta que recibió.
    """
    gmail_sesion = request.session.get("usuario_gmail")
    if not gmail_sesion:
        return _resp({"error": "No autenticado"}, status=401)

    usuario_doc = get_usuario_doc(gmail_sesion)
    if not usuario_doc:
        return _resp({"error": "Usuario no encontrado"}, status=404)
    roles = get_roles(usuario_doc)
    es_staff = any(r in ("Profesor", "Preceptor", "Admin") for r in roles)

    lim = request.GET.get("limite")
    try:
        limite = max(1, min(200, int(lim))) if lim else 100
    except (TypeError, ValueError):
        limite = 100

    if es_staff:
        filtro = {"destinatarioGmail": gmail_sesion}
    else:
        filtro = {"emisorGmail": gmail_sesion}

    solo_abiertos = request.GET.get("abiertos") in ("1", "true", "si")
    if solo_abiertos:
        filtro["estado"] = "pendiente"

    cursor = _mongo_db[COLECCION].find(filtro).sort("creado", -1).limit(limite)
    mensajes = [_vista(m, es_staff) for m in cursor]
    pendientes = sum(1 for m in mensajes if m["estado"] == "pendiente")
    return _resp({"mensajes": mensajes, "pendientes": pendientes})


def _vista(m, es_staff):
    """Proyecta un mensaje a lo que ve el que consulta.

    Al autor de la nota no se le muestra el PIN (no se guarda) ni hace falta
    mostrarle si el emisor usó PIN: al autor le importa el mensaje.
    """
    return {
        "id": str(m.get("_id")),
        "notaId": str(m.get("notaId") or ""),
        "notaTitulo": m.get("notaTitulo") or "",
        "curso": m.get("curso") or "",
        "emisor": m.get("emisorNombre") or m.get("emisorGmail") or "",
        "emisorRol": m.get("emisorRol") or "",
        "emisorGmail": m.get("emisorGmail") or "",
        "destinatario": m.get("destinatarioGmail") or "",
        "mensaje": m.get("mensaje") or "",
        "creado": m.get("creado") or "",
        "leido": bool(m.get("leido", False)),
        "estado": m.get("estado") or "pendiente",
        "respuesta": m.get("respuesta") or None,
        # Sólo lo ve el autor: le dice que el mensaje pasó por el PIN del alumno.
        "pinVerificado": bool(m.get("pinVerificado")) if es_staff else None,
    }


@require_POST
def api_responder_mensaje(request):
    """POST /api/notas/mensaje/responder/ -> el autor de la nota contesta.

    No pide PIN: es su nota. Lo que no puede es contestar un mensaje de una
    nota que no es suya (se valida contra el AutorGmail de la nota del mensaje).
    """
    gmail_sesion = request.session.get("usuario_gmail")
    if not gmail_sesion:
        return _resp({"error": "No autenticado"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return _resp({"error": "JSON inválido"}, status=400)

    mensaje_id = (data.get("mensajeId") or "").strip()
    texto = (data.get("texto") or "").strip()
    cerrar = bool(data.get("cerrar"))

    if not texto and not cerrar:
        return _resp({"error": "Escribí una respuesta o cerrá la consulta"}, status=400)
    if len(texto) > MAX_MENSAJE:
        return _resp({"error": "La respuesta excede el largo permitido"}, status=400)

    try:
        mensaje = _mongo_db[COLECCION].find_one({"_id": ObjectId(mensaje_id)})
    except (InvalidId, TypeError, ValueError):
        return _resp({"error": "Mensaje no válido"}, status=400)
    if not mensaje:
        return _resp({"error": "Mensaje no encontrado"}, status=404)

    # La autorización va contra la NOTA del mensaje, no contra el campo
    # destinatarioGmail del mensaje: si ese campo se manipulara, se colaría
    # alguien. La nota es la fuente de verdad de quién la escribió.
    nota, err = _buscar_nota(str(mensaje.get("notaId") or ""))
    if err:
        return err
    if nota.get("AutorGmail") != gmail_sesion:
        return _resp({"error": "No tenés autorización sobre esta nota"}, status=403)

    ahora = datetime.now().isoformat()
    cambios = {"leido": True}
    if cerrar:
        cambios["estado"] = "respondida" if texto else "resuelta"
    else:
        cambios["estado"] = "respondida"
    if texto:
        usuario_doc = get_usuario_doc(gmail_sesion) or {}
        cambios["respuesta"] = {
            "texto": texto,
            "autor": _nombre(usuario_doc) or gmail_sesion,
            "fecha": ahora,
        }
    _mongo_db[COLECCION].update_one({"_id": mensaje["_id"]}, {"$set": cambios})
    log_accion(
        request,
        "Respuesta a mensaje de nota",
        f"{nota.get('Curso')} · {nota.get('Titulo')}",
        usuario=gmail_sesion,
    )
    return _resp({"ok": True, "estado": cambios["estado"], "leido": True})
