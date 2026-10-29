"""Pruebas de seguridad sobre una base DESCARTABLE (cuaderno_db_test).

No toca la base real. Crea su propia base, corre las pruebas y la borra.

Uso:
    python scripts/test_seguridad.py
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ["MONGO_DB_NAME"] = "cuaderno_db_test"
os.environ["DJANGO_ALLOWED_HOSTS"] = "localhost,127.0.0.1,testserver"
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

import bcrypt
from django.conf import settings
from django.test import Client

from config import db as db_conf

TEST_DB = db_conf.get_db()

ADMIN = "admin@test.edu.ar"
PROF = "profesor@test.edu.ar"
PREC = "preceptor@test.edu.ar"
AL1 = "alumno1@test.edu.ar"
AL2 = "alumno2@test.edu.ar"
AL7B = "alumno7b@test.edu.ar"
MULTI = "multiroles@test.edu.ar"
PROF2 = "profesor2@test.edu.ar"
AL4B = "alumno4b@test.edu.ar"


def _hash(p):
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _usuario(gmail, rol, curso):
    return {
        "Gmail": gmail,
        "Apellido": gmail.split("@")[0],
        "Nombres": "Test",
        "Contraseña": _hash("contrasena123"),
        "Rol": rol,
        "Curso": curso,
        "N°": 1,
        "estado": "Activo",
    }


def _crear_curso(nombre):
    cid = TEST_DB.cursos.insert_one({"nombre": nombre, "activo": True}).inserted_id
    return cid


def _set_session(client, gmail):
    s = client.session
    s["usuario_gmail"] = gmail
    s["_expira"] = (datetime.now() + timedelta(minutes=30)).isoformat()
    s.save()
    client.cookies[settings.SESSION_COOKIE_NAME] = s.session_key


def _set_session_vencida(client, gmail):
    s = client.session
    s["usuario_gmail"] = gmail
    s["_expira"] = (datetime.now() - timedelta(minutes=5)).isoformat()
    s.save()
    client.cookies[settings.SESSION_COOKIE_NAME] = s.session_key


def setup():
    db_conf.get_client().drop_database(TEST_DB.name)
    c7a = _crear_curso("7A")
    c7b = _crear_curso("7B")
    c4a = _crear_curso("4A")
    c4b = _crear_curso("4B")
    TEST_DB.usuarios.insert_many([
        _usuario(ADMIN, "Admin", None),
        _usuario(PROF, "Profesor", None),
        _usuario(PREC, "Preceptor", None),
        _usuario(AL1, "Alumno", "7A"),
        _usuario(AL2, "Alumno", "7A"),
        _usuario(AL7B, "Alumno", "7B"),
        _usuario(MULTI, ["Profesor", "Preceptor"], None),
        _usuario(PROF2, "Profesor", None),
        _usuario(AL4B, "Alumno", "4B"),
    ])
    pdoc = TEST_DB.usuarios.find_one({"Gmail": PROF})
    adoc = TEST_DB.usuarios.find_one({"Gmail": PREC})
    mdoc = TEST_DB.usuarios.find_one({"Gmail": MULTI})
    p2doc = TEST_DB.usuarios.find_one({"Gmail": PROF2})
    TEST_DB.asignaciones.insert_many([
        {"usuario_id": pdoc["_id"], "curso_id": c7a, "materia": "Matemática", "rol": "Profesor"},
        {"usuario_id": adoc["_id"], "curso_id": c7a, "materia": None, "rol": "preceptor"},
        {"usuario_id": mdoc["_id"], "curso_id": c4b, "materia": "Educación Física", "rol": "Profesor"},
        {"usuario_id": mdoc["_id"], "curso_id": c4a, "materia": None, "rol": "preceptor"},
        {"usuario_id": p2doc["_id"], "curso_id": c7b, "materia": "Lengua", "rol": "Profesor"},
    ])
    # Todos los alumnos de prueba comparten PIN. Es a propósito: las respuestas
    # a notas se autorizan con el mismo `pinResponsable` con el que el alumno
    # confirma, así que el fixture tiene que reflejar esa realidad.
    TEST_DB.usuarios.update_many(
        {"Gmail": {"$in": [AL1, AL2, AL7B]}},
        {"$set": {"pinResponsable": _hash(PIN_ALUMNO), "pin_habilitado": True, "pin_intentos_fallidos": 0}},
    )


def limpiar():
    db_conf.get_client().drop_database(TEST_DB.name)


def test_login_generico(client):
    r = client.post("/login/", {"Gmail": "noexiste@test.edu.ar", "password": "x"})
    assert r.status_code == 200, r.status_code
    assert b"Credenciales incorrectas" in r.content, "debe ser mensaje genérico"


def test_login_rate_limit_cuenta(client):
    for _ in range(5):
        client.post("/login/", {"Gmail": AL1, "password": "mal"})
    r = client.post("/login/", {"Gmail": AL1, "password": "mal"})
    assert r.status_code == 200
    assert b"Demasiados intentos" in r.content, "6to intento debe estar bloqueado"


def test_login_sesion_rotada(client):
    r = client.post("/login/", {"Gmail": ADMIN, "password": "contrasena123"})
    assert r.status_code in (302, 200), r.status_code


def test_idor_calificaciones(client):
    _set_session(client, AL1)
    r = client.get(f"/api/calificaciones/?curso=7A&materia=Matemática&alumno={AL2}")
    assert r.status_code == 403, f"alumno no debe ver calificaciones de otro: {r.status_code}"
    r = client.get(f"/api/calificaciones/?curso=7A&materia=Matemática&alumno={AL1}")
    assert r.status_code == 200, "alumno sí ve las propias"
    r = client.get(f"/api/calificaciones/?curso=7B&materia=Matemática&alumno={AL7B}")
    assert r.status_code == 403, "alumno no ve un curso ajeno"


def test_alumnos_por_curso_roles(client):
    _set_session(client, AL1)
    r = client.get("/api/alumnos/?curso=7A")
    assert r.status_code == 200
    data = r.json()
    assert len(data["alumnos"]) == 1 and data["alumnos"][0]["gmail"] == AL1, "alumno solo ve su registro"

    _set_session(client, PROF)
    r = client.get("/api/alumnos/?curso=7A")
    assert r.status_code == 200 and len(r.json()["alumnos"]) >= 2
    r = client.get("/api/alumnos/?curso=7B")
    assert r.status_code == 403, "profesor no ve curso donde no dicta"

    _set_session(client, PREC)
    r = client.get("/api/alumnos/?curso=7A")
    assert r.status_code == 200, "preceptor ve su curso"
    r = client.get("/api/alumnos/?curso=7B")
    assert r.status_code == 403, "preceptor no ve curso ajeno"


def test_crear_nota_autorrol_spoofed(client):
    _set_session(client, AL1)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "tipo": "comunicado", "titulo": "t",
                         "contenido": "c", "autorRol": "Admin"}),
        content_type="application/json",
    )
    assert r.status_code == 403, "alumno no crea notas aunque spoofee autorRol"

    _set_session(client, PROF)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "tipo": "comunicado", "titulo": "t",
                         "contenido": "c", "autorRol": "Admin"}),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    nota = TEST_DB.notas.find_one({"Titulo": "t"})
    assert nota and nota["AutorRol"] == "Profesor", "el rol lo pone el servidor, no el navegador"

    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "tipo": "hack", "titulo": "t", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 400, "tipo de nota debe estar en whitelist"


def test_nota_multi_destinatario_no_filtra_por_curso(client):
    """El grupo de destinatarios tiene que mandar sobre el filtro de curso.

    Es el riesgo real del modelo "una nota con lista": antes, una nota sin
    AlumnoGmail la veía todo el curso. Si el chequeo se queda sólo en el
    curso, cualquier alumno del curso leería (y firmaría) una nota dirigida
    a sus compañeros.
    """
    # Tercer alumno de 7A, para probar que NO seleccionado no puede firmar.
    TEST_DB.usuarios.insert_one(
        _usuario("alumno3@test.edu.ar", "Alumno", "7A")
    )

    _set_session(client, PREC)  # preceptor de 7A
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1, AL2], "tipo": "comunicado",
                         "titulo": "Solo Ana y Belen", "contenido": "c", "requierePin": True}),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    nota = TEST_DB.notas.find_one({"Titulo": "Solo Ana y Belen"})
    assert nota and sorted(nota["alumnos"]) == sorted([AL1, AL2]), \
        "debe quedar la lista de destinatarios"

    # Carla es del mismo curso pero no está en la lista: no puede firmar.
    _set_session(client, "alumno3@test.edu.ar")
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "12345678"}),
                    content_type="application/json")
    assert r.status_code == 403, f"alumno fuera del grupo firmó (fue {r.status_code})"
    firmas = TEST_DB.notas.find_one({"_id": nota["_id"]}).get("firmas") or []
    assert "alumno3@test.edu.ar" not in firmas, "no debe quedar la firma de Carla"

    # Ana sí puede.
    _set_session(client, AL1)
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "12345678"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    firmas = TEST_DB.notas.find_one({"_id": nota["_id"]})["firmas"]
    assert firmas == [AL1], f"firmas incorrectas: {firmas}"
    # Con un grupo, la nota NO queda confirmada hasta que firmó el último:
    # "confirmada" se guarda sólo cuando firmó todo el grupo.
    doc = TEST_DB.notas.find_one({"_id": nota["_id"]})
    assert not doc.get("confirmada"), "no debe quedar confirmada con una sola firma"
    assert not doc.get("todosFirmaron"), "no es todosFirmaron con 1 de 2"


def test_nota_multi_destinatario_rechaza_alumno_ajeno(client):
    """No se puede meter a un alumno de otro curso en la lista."""
    _set_session(client, PREC)  # preceptor de 7A
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1, AL7B],
                         "tipo": "comunicado", "titulo": "mezcla", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 400, f"aceptó un alumno de otro curso (fue {r.status_code})"
    assert TEST_DB.notas.find_one({"Titulo": "mezcla"}) is None, "no debe guardar la nota"


def test_nota_lista_vacia_400(client):
    _set_session(client, PREC)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [], "tipo": "comunicado",
                         "titulo": "nadie", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 400, f"lista vacía aceptada (fue {r.status_code})"


def test_editar_nota_solo_autor(client):
    _set_session(client, PREC)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1, AL2], "tipo": "comunicado",
                         "titulo": "Original", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    nota = TEST_DB.notas.find_one({"Titulo": "Original"})

    # Otro docente no puede cambiarla.
    _set_session(client, PROF2)  # profesor de 7B
    r = client.post("/api/notas/editar/",
                    data=json_dumps({"id": str(nota["_id"]), "titulo": "Hackeada",
                                     "contenido": "x"}),
                    content_type="application/json")
    assert r.status_code == 403, f"otro docente editó la nota (fue {r.status_code})"
    assert TEST_DB.notas.find_one({"_id": nota["_id"]})["Titulo"] == "Original"

    # El autor sí.
    _set_session(client, PREC)
    r = client.post("/api/notas/editar/",
                    data=json_dumps({"id": str(nota["_id"]), "titulo": "Corregida",
                                     "contenido": "c corregido"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    guardada = TEST_DB.notas.find_one({"_id": nota["_id"]})
    assert guardada["Titulo"] == "Corregida", "el texto corregido no se guardó"


def test_editar_nota_no_tras_firmar(client):
    _set_session(client, PREC)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1, AL2], "tipo": "comunicado",
                         "titulo": "Con firma", "contenido": "c", "requierePin": True}),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    nota = TEST_DB.notas.find_one({"Titulo": "Con firma"})

    _set_session(client, AL1)
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "12345678"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content

    _set_session(client, PREC)
    r = client.post("/api/notas/editar/",
                    data=json_dumps({"id": str(nota["_id"]), "titulo": "Cambiada",
                                     "contenido": "otro"}),
                    content_type="application/json")
    assert r.status_code == 400, f"editó una nota ya firmada (fue {r.status_code})"
    assert TEST_DB.notas.find_one({"_id": nota["_id"]})["Titulo"] == "Con firma"


def test_alumno_no_crea_notas_multi(client):
    _set_session(client, AL1)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1, AL2], "tipo": "comunicado",
                         "titulo": "No", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 403, f"alumno creó nota múltiple (fue {r.status_code})"


def test_editar_nota_idor(client):
    _set_session(client, PREC)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1], "tipo": "comunicado",
                         "titulo": "Privada", "contenido": "c"}),
        content_type="application/json",
    )
    nota = TEST_DB.notas.find_one({"Titulo": "Privada"})
    _set_session(client, ADMIN)  # admin no es el autor: tampoco edita
    r = client.post("/api/notas/editar/",
                    data=json_dumps({"id": str(nota["_id"]), "titulo": "x", "contenido": "y"}),
                    content_type="application/json")
    assert r.status_code == 403, f"admin que no es autor editó (fue {r.status_code})"
    assert TEST_DB.notas.find_one({"_id": nota["_id"]})["Titulo"] == "Privada"


def test_alumnos_multiroles_permisos_or(client):
    """Un usuario profesor+preceptor conserva AMBOS permisos (bug del 403 secuencial)."""
    _set_session(client, MULTI)  # profesor de 4B, preceptor de 4A
    r = client.get("/api/alumnos/?curso=4B")
    assert r.status_code == 200, f"profesor de 4B debe ver 4B: {r.status_code} {r.content}"
    gmails = {a["gmail"] for a in r.json()["alumnos"]}
    assert AL4B in gmails, "debe incluir alumnos de 4B"
    assert AL1 not in gmails and AL2 not in gmails, "nunca alumnos de otro curso"

    r = client.get("/api/alumnos/?curso=4A")
    assert r.status_code == 200, "preceptor de 4A debe ver 4A"

    r = client.get("/api/alumnos/?curso=7A")
    assert r.status_code == 403, "sin asignación en 7A -> 403"


def test_alumnos_sin_asignacion_403(client):
    _set_session(client, PROF)  # solo profesor de 7A
    r = client.get("/api/alumnos/?curso=4B")
    assert r.status_code == 403, "profesor sin asignación en 4B -> 403"


def test_alumnos_curso_inexistente_404(client):
    _set_session(client, ADMIN)
    r = client.get("/api/alumnos/?curso=ZZ9")
    assert r.status_code == 404, "curso inexistente -> 404"


def test_alumnos_no_autenticado_401(client):
    client.cookies.clear()
    r = client.get("/api/alumnos/?curso=4B")
    assert r.status_code == 401, "sin sesión -> 401"


def test_alumnos_alumno_curso_ajeno_403(client):
    _set_session(client, AL1)  # alumno de 7A
    r = client.get("/api/alumnos/?curso=4B")
    assert r.status_code == 403, "alumno no ve alumnos de otro curso"
    r = client.get("/api/alumnos/?curso=7A")
    assert r.status_code == 200, "alumno ve su propio registro"


def test_nota_curso_sin_permiso_403(client):
    _set_session(client, PROF)  # profesor de 7A
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "4B", "tipo": "comunicado", "titulo": "t", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 403, "no se puede enviar nota a un curso sin asignación"
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7B", "tipo": "comunicado", "titulo": "t", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 403, "ni a un curso ajeno"

    _set_session(client, PROF2)  # profesor de 7B
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7B", "tipo": "comunicado", "titulo": "t2", "contenido": "c"}),
        content_type="application/json",
    )
    assert r.status_code == 200, "profesor de 7B sí envía a 7B"


PIN_ALUMNO = "12345678"


def _crear_nota_para_responder(client, titulo, autor=PREC, destinatarios=None, **extra):
    """Crea una nota dirigida a AL1 (o a quien se le pase) y devuelve el documento.

    No hay ningun parametro de PIN: la respuesta se autoriza con el
    `pinResponsable` del alumno, no con una credencial que elija quien envia la
    nota. El `titulo` va por parametro a proposito: `setup()` corre una sola vez
    para toda la suite, asi que si dos tests usaran el mismo titulo, el segundo
    leeria la nota del primero (con sus intentos de PIN ya consumidos) y el
    test probaria algo distinto de lo que cree.
    """
    cuerpo = {
        "curso": "7A", "destinatarios": destinatarios or [AL1], "tipo": "comunicado",
        "titulo": titulo, "contenido": "Firma la nota, por favor.",
        "requierePin": True,
    }
    cuerpo.update(extra)
    _set_session(client, autor)
    r = client.post("/api/notas/crear/", data=json_dumps(cuerpo),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    return TEST_DB.notas.find_one({"Titulo": titulo})


def test_nota_respuesta_usa_el_pin_del_alumno(client):
    """La credencial es el pinResponsable del alumno, no uno de la nota."""
    nota = _crear_nota_para_responder(client, "RP pin del alumno")
    assert not nota.get("pinRespuesta"), "la nota no guarda ningun PIN de respuesta"

    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "9999",
                                     "mensaje": "escribo sin mi PIN"}),
                    content_type="application/json")
    assert r.status_code == 400, r.content
    assert not list(TEST_DB.nota_mensajes.find({"notaId": nota["_id"]})), \
        "un PIN incorrecto no debe dejar ningun mensaje guardado"

    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "Me confirmas que la lei?"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    guardado = TEST_DB.nota_mensajes.find_one({"notaId": nota["_id"]})
    assert guardado, "con el PIN del alumno el mensaje se guarda"
    assert guardado["destinatarioGmail"] == PREC, "le llega a quien envio la nota"
    assert not guardado.get("pin"), "jamas se guarda el PIN en el mensaje"
    assert guardado["pinVerificado"] is True


def test_nota_respuesta_mismo_pin_que_confirma(client):
    """El PIN que abre la respuesta es el mismo que abre la confirmacion.

    Es el contrato del diseno: una sola credencial por alumno. Si se separaran,
    un alumno podria confirmar sin poder escribir (o al reves), que es
    justamente la incoherencia a evitar.
    """
    nota = _crear_nota_para_responder(client, "RP mismo pin")

    # Con el PIN correcto, las dos vias funcionan.
    _set_session(client, AL1)
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "gracias, ya confirme"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content

    # Con un PIN que no es el suyo, ninguna de las dos. La nota va dirigida a
    # AL2 para que el 403 de "no te corresponde" no tape el resultado del PIN.
    nota2 = _crear_nota_para_responder(client, "RP mismo pin mal", destinatarios=[AL2])
    _set_session(client, AL2)
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota2["_id"]), "pin": "99999999"}),
                    content_type="application/json")
    assert r.status_code == 400, r.content
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota2["_id"]), "pin": "99999999",
                                     "mensaje": "escribo con un PIN ajeno"}),
                    content_type="application/json")
    assert r.status_code == 400, r.content
    assert not list(TEST_DB.nota_mensajes.find({"notaId": nota2["_id"]})), \
        "un PIN ajeno no abre la via de escritura"


def test_nota_respuesta_exige_pin(client):
    """Sin PIN no hay mensaje: la via no se puede usar de a balde."""
    nota = _crear_nota_para_responder(client, "RP sin pin no envia")
    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]),
                                     "mensaje": "hola, sin PIN"}),
                    content_type="application/json")
    assert r.status_code == 400, r.content
    assert not list(TEST_DB.nota_mensajes.find({"notaId": nota["_id"]})), \
        "el mensaje sin PIN no se guarda"


def test_nota_respuesta_bloquea_el_pin_del_alumno(client):
    """El bloqueo es el del alumno, y frena tambien la confirmacion.

    Al ser la misma credencial, no puede haber un contador para escritura y
    otro para firma: se bloquearia uno y el otro seguiria abierto.
    """
    nota = _crear_nota_para_responder(client, "RP bloqueo compartido")
    _set_session(client, AL1)
    for _ in range(5):
        client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "0000",
                                     "mensaje": "x"}),
                    content_type="application/json")
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "ahora con el PIN correcto"}),
                    content_type="application/json")
    assert r.status_code == 429, "tras 5 intentos fallidos el PIN queda bloqueado"
    assert not list(TEST_DB.nota_mensajes.find({"notaId": nota["_id"]})), \
        "el bloqueo tiene que impedir el envio, no solo avisar"

    # Y la confirmacion tampoco esquiva el bloqueo.
    r = client.post("/api/notas/confirmar/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO}),
                    content_type="application/json")
    assert r.status_code == 429, "el bloqueo del PIN tambien frena la confirmacion"

    # El contador vive en el usuario, no en la nota: asi el bloqueo no se
    # esquiva cambiando de nota.
    assert not TEST_DB.notas.find_one({"_id": nota["_id"]}).get("respuesta_intentos_fallidos"), \
        "el bloqueo no se lleva la cuenta por nota"
    doc = TEST_DB.usuarios.find_one({"Gmail": AL1})
    assert int(doc["pin_intentos_fallidos"]) >= 5, "el contador es del usuario"

    # Se deja el PIN habilitado para que los tests siguientes no hereden esto.
    TEST_DB.usuarios.update_one(
        {"Gmail": AL1}, {"$set": {"pin_habilitado": True, "pin_intentos_fallidos": 0}}
    )


def test_nota_respuesta_acerto_reinicia_el_contador(client):
    """Un acierto borra los fallos previos, como al confirmar."""
    nota = _crear_nota_para_responder(client, "RP reinicio contador")
    _set_session(client, AL1)
    for _ in range(3):
        client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "0000",
                                     "mensaje": "x"}),
                    content_type="application/json")
    assert int(TEST_DB.usuarios.find_one({"Gmail": AL1})["pin_intentos_fallidos"]) == 3

    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "esta vez si"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    assert int(TEST_DB.usuarios.find_one({"Gmail": AL1})["pin_intentos_fallidos"]) == 0, \
        "acertar el PIN limpia los intentos fallidos"


def test_nota_respuesta_solo_destinatarios(client):
    nota = _crear_nota_para_responder(client, "RP solo destinatarios")
    # AL2 es del curso pero NO destinatario: la nota trae lista `alumnos`.
    _set_session(client, AL2)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "yo no recibi esto"}),
                    content_type="application/json")
    assert r.status_code == 403, f"alumno no destinatario respondio (fue {r.status_code})"
    assert not list(TEST_DB.nota_mensajes.find({"notaId": nota["_id"]})), \
        "no se guarda el mensaje de un alumno que no es destinatario"

    # Y tampoco con el PIN correcto sobre una nota de otro curso.
    _set_session(client, AL7B)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "de otro curso"}),
                    content_type="application/json")
    assert r.status_code == 403


def test_nota_respuesta_idor_responder(client):
    """Solo el AUTOR de la nota contesta el mensaje."""
    nota = _crear_nota_para_responder(client, "RP idor responder")
    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "hola"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    mensaje = TEST_DB.nota_mensajes.find_one({"notaId": nota["_id"]})

    # Un tercer docente que no escribio la nota.
    _set_session(client, PROF2)
    r = client.post("/api/notas/mensaje/responder/",
                    data=json_dumps({"mensajeId": str(mensaje["_id"]),
                                     "texto": "te paso el PIN"}),
                    content_type="application/json")
    assert r.status_code == 403, f"un docente ajeno respondio (fue {r.status_code})"
    assert TEST_DB.nota_mensajes.find_one({"_id": mensaje["_id"]})["respuesta"] is None, \
        "no se escribe la respuesta de un tercero"

    # El alumno tampoco puede auto-responderse.
    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/responder/",
                    data=json_dumps({"mensajeId": str(mensaje["_id"]),
                                     "texto": "me lo contesto solo"}),
                    content_type="application/json")
    assert r.status_code == 403

    # El autor si.
    _set_session(client, PREC)
    r = client.post("/api/notas/mensaje/responder/",
                    data=json_dumps({"mensajeId": str(mensaje["_id"]),
                                     "texto": "recibido, anda tranquilo", "cerrar": True}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    guardado = TEST_DB.nota_mensajes.find_one({"_id": mensaje["_id"]})
    assert guardado["respuesta"]["texto"] == "recibido, anda tranquilo"
    assert guardado["estado"] == "respondida"


def test_nota_respuesta_bandeja_aislada(client):
    """Cada quien solo ve lo suyo: el autor lo suyo, el alumno lo que mando."""
    nota = _crear_nota_para_responder(client, "RP bandeja")
    _set_session(client, AL1)
    client.post("/api/notas/mensaje/",
                data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                 "mensaje": "primer mensaje"}),
                content_type="application/json")

    # La base es compartida entre tests, asi que se mira ESTA nota y no el total.
    def en_la_caja(nota_id):
        return [m for m in client.get("/api/notas/mensajes/").json()["mensajes"]
                if m["notaId"] == nota_id]

    _set_session(client, PREC)
    r = client.get("/api/notas/mensajes/")
    assert r.status_code == 200, r.content
    assert len(en_la_caja(str(nota["_id"]))) == 1, "el autor ve el mensaje recibido"
    # El autor ve que el mensaje paso por el PIN; el alumno, no.
    assert en_la_caja(str(nota["_id"]))[0]["pinVerificado"] is True

    # Alumno ajeno: no ve nada de esta nota.
    _set_session(client, AL2)
    assert en_la_caja(str(nota["_id"])) == [], \
        "un alumno ve solo lo que el mando"

    _set_session(client, AL1)
    propios = en_la_caja(str(nota["_id"]))
    assert len(propios) == 1, "el alumno ve el mensaje que mando"
    assert propios[0]["pinVerificado"] is None, \
        "al alumno no se le revela si el mensaje uso PIN"
    assert propios[0]["emisorGmail"] == AL1, "el alumno ve su propio mensaje"


def test_nota_ignora_pin_respuesta_del_remitente(client):
    """Quien envia la nota no define ninguna credencial.

    Si `pinRespuesta` llegara a guardarse, volveria a existir el modelo de dos
    PINs que se decidio descartar.
    """
    _set_session(client, PREC)
    r = client.post(
        "/api/notas/crear/",
        data=json_dumps({"curso": "7A", "destinatarios": [AL1], "tipo": "comunicado",
                         "titulo": "Intento de PIN propio", "contenido": "c",
                         "requierePin": True, "pinRespuesta": "1234"}),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    nota = TEST_DB.notas.find_one({"Titulo": "Intento de PIN propio"})
    assert nota, "la nota se crea igual: el campo sobrante se descarta"
    assert not nota.get("pinRespuesta"), "no se guarda un PIN de respuesta en la nota"

    # Y ese PIN inventado no sirve para escribir.
    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": "1234",
                                     "mensaje": "uso el PIN que puso el preceptor"}),
                    content_type="application/json")
    assert r.status_code == 400, "el PIN del remitente no habilita la escritura"


def test_nota_respuesta_pin_en_claro_no_viaja(client):
    """Ni el PIN del alumno en claro ni su hash llegan al navegador."""
    nota = _crear_nota_para_responder(client, "RP sin fuga")
    _set_session(client, AL1)
    cuerpo = json_dumps(_get_notas_alumno(AL1, "7A"))
    assert PIN_ALUMNO not in cuerpo, "el PIN nunca viaja al navegador"
    assert "pinResponsable" not in cuerpo, \
        "al alumno no se le manda su hash de PIN"
    assert "pinRespuesta" not in cuerpo, \
        "el historial del alumno tampoco lo lleva"

    _set_session(client, PREC)
    r = client.get("/api/notas/enviadas/")
    assert r.status_code == 200
    assert PIN_ALUMNO not in r.text, "el PIN no se devuelve en el historial"
    assert str(nota["_id"]) in r.text, "pero la nota si aparece en su historial"

    # Tampoco viaja en la bandeja de mensajes.
    _set_session(client, AL1)
    r = client.post("/api/notas/mensaje/",
                    data=json_dumps({"notaId": str(nota["_id"]), "pin": PIN_ALUMNO,
                                     "mensaje": "hola"}),
                    content_type="application/json")
    assert r.status_code == 200, r.content
    assert PIN_ALUMNO not in client.get("/api/notas/mensajes/").text, \
        "el PIN no aparece en la bandeja"
    assert not TEST_DB.nota_mensajes.find_one({"notaId": nota["_id"]}).get("pin"), \
        "el PIN no se guarda en el mensaje"



def _get_notas_alumno(gmail, curso):
    from cuaderno.views import _get_notas_alumno as fn
    return fn(gmail, curso)


def test_asistencia_autorizacion(client):
    FECHA = "2026-08-16"
    _set_session(client, PREC)  # preceptor de 7A
    r = client.get(f"/api/asistencia/preceptor/?curso=7A&fecha={FECHA}&tipo=institucional&turno=ma%C3%B1ana")
    assert r.status_code == 200, "preceptor carga institucional de su curso"
    r = client.get(f"/api/asistencia/preceptor/?curso=7B&fecha={FECHA}&tipo=institucional&turno=ma%C3%B1ana")
    assert r.status_code == 403, "preceptor no carga curso ajeno"

    _set_session(client, PROF)  # profesor de 7A Matemática
    r = client.get(f"/api/asistencia/profesor/?curso=7A&materia=Matem%C3%A1tica&fecha={FECHA}")
    assert r.status_code == 200, "profesor carga su materia"
    r = client.get(f"/api/asistencia/profesor/?curso=7B&materia=Matem%C3%A1tica&fecha={FECHA}")
    assert r.status_code == 403, "profesor no carga materia de curso ajeno"

    _set_session(client, MULTI)  # profesor de 4B (Ed. Física), preceptor de 4A
    r = client.get(f"/api/asistencia/preceptor/?curso=4B&fecha={FECHA}&tipo=materia&materia=Educaci%C3%B3n%20F%C3%ADsica")
    assert r.status_code == 200, "multirol ve su materia vía preceptor(por materia)"
    r = client.get(f"/api/asistencia/preceptor/?curso=4B&fecha={FECHA}&tipo=institucional&turno=ma%C3%B1ana")
    assert r.status_code == 403, "profesor no es preceptor: institucional de 4B -> 403"

    # Ser preceptor de 4A NO habilita a tocar la asistencia de las materias que
    # no dicta: sólo la institucional del curso.
    r = client.get(f"/api/asistencia/preceptor/?curso=4A&fecha={FECHA}&tipo=institucional&turno=ma%C3%B1ana")
    assert r.status_code == 200, "preceptor de 4A sí carga la institucional de 4A"
    r = client.get(f"/api/asistencia/profesor/?curso=4A&materia=Matem%C3%A1tica&fecha={FECHA}")
    assert r.status_code == 403, "preceptor de 4A no puede marcar Matemática: no la dicta"


def test_asistencia_no_pisa_materia_ajena(client):
    """Un preceptor no puede escribir la asistencia de otro profesor."""
    FECHA = "2026-08-16"
    _set_session(client, MULTI)  # preceptor de 4A, profesor de 4B Ed. Física

    r = client.post(
        "/api/asistencia/preceptor/guardar/",
        data=json_dumps({
            "curso": "4A", "fecha": FECHA, "tipo": "materia", "materia": "Matemática",
            "registros": [{"gmail": AL1, "estado": "Ausente"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 403, r.content
    assert TEST_DB.asistencias.find_one(
        {"alumnoGmail": AL1, "fecha": FECHA, "tipo": "materia", "materia": "Matemática"}
    ) is None, "no se escribe asistencia de una materia ajena"

    r = client.post(
        "/api/asistencia/profesor/guardar/",
        data=json_dumps({
            "curso": "4A", "fecha": FECHA, "materia": "Matemática",
            "registros": [{"gmail": AL1, "estado": "Ausente"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 403, r.content

    # La suya sí se puede escribir, para confirmar que el 403 no vino de otra cosa.
    r = client.post(
        "/api/asistencia/preceptor/guardar/",
        data=json_dumps({
            "curso": "4B", "fecha": FECHA, "tipo": "materia", "materia": "Educación Física",
            "registros": [{"gmail": AL4B, "estado": "Presente"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    assert TEST_DB.asistencias.find_one(
        {"alumnoGmail": AL4B, "fecha": FECHA, "materia": "Educación Física"}
    ) is not None, "la materia propia sí se guarda"


def test_asistencia_guardar_rol_servidor(client):
    _set_session(client, PREC)
    r = client.post(
        "/api/asistencia/preceptor/guardar/",
        data=json_dumps({
            "curso": "7A", "fecha": "2026-08-16", "tipo": "institucional", "turno": "mañana",
            "registros": [{"gmail": AL1, "estado": "Presente", "minutosRetraso": None,
                           "horaIngreso": "", "observacion": "OK"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    doc = TEST_DB.asistencias.find_one({"alumnoGmail": AL1, "fecha": "2026-08-16", "tipo": "institucional"})
    assert doc and doc["estado"] == "Presente"
    assert "Preceptor" in doc["registradoPorRol"], "el rol lo define el servidor"

    r = client.post(
        "/api/asistencia/preceptor/guardar/",
        data=json_dumps({
            "curso": "7A", "fecha": "2026-08-16", "tipo": "institucional", "turno": "mañana",
            "registros": [{"gmail": AL7B, "estado": "Presente"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 200, "alumno de otro curso se descarta sin error"
    assert TEST_DB.asistencias.find_one({"alumnoGmail": AL7B}) is None, "no se crean registros de alumnos ajenos"

    r = client.post(
        "/api/asistencia/preceptor/guardar/",
        data=json_dumps({
            "curso": "7A", "fecha": "2026-08-16", "tipo": "institucional", "turno": "mañana",
            "registros": [{"gmail": AL1, "estado": "Inválido"}],
        }),
        content_type="application/json",
    )
    assert r.status_code == 200, "estados inválidos se descartan sin generar error"
    # No debe modificar el registro previamente guardado
    doc = TEST_DB.asistencias.find_one({"alumnoGmail": AL1, "fecha": "2026-08-16", "tipo": "institucional"})
    assert doc and doc["estado"] == "Presente"


def test_asistencia_alumno_idor(client):
    _set_session(client, AL1)
    r = client.get("/api/asistencia/alumno/?gmail=" + AL1)
    assert r.status_code == 200, "alumno ve su propia asistencia"
    assert isinstance(r.json(), dict), "la respuesta es un objeto con resumen de asistencia"
    assert "historial" in r.json()

    r = client.get("/api/asistencia/alumno/?gmail=" + AL2)
    assert r.status_code == 403, "alumno no ve asistencia de otro"

    _set_session(client, PREC)  # preceptor de 7A (curso de AL1)
    r = client.get("/api/asistencia/alumno/?gmail=" + AL1)
    assert r.status_code == 200, "preceptor del curso sí accede"


def test_asistencia_justificar_no_autoaprobacion(client):
    _set_session(client, AL1)
    r = client.post(
        "/api/asistencia/justificar/",
        data=json_dumps({
            "gmail": AL1, "fecha": "2026-08-16", "turno": "mañana",
            "tipoJustificacion": "certificado", "motivo": "Enfermedad",
            "fechaPresentacion": "2026-08-17", "fechaInasistencia": "2026-08-16",
            "observacion": "", "estado": "Justificada", "certificado": "cert-123",
        }),
        content_type="application/json",
    )
    assert r.status_code == 200, r.content
    doc = TEST_DB.asistencias.find_one({"alumnoGmail": AL1, "fecha": "2026-08-16"})
    assert doc and doc.get("justificacion")
    assert doc["justificacion"]["estado"] == "Pendiente", "el alumno no puede auto-aprobar"
    assert doc["justificacion"].get("certificado") == "", "el certificado del alumno se descarta"

    r = client.post(
        "/api/asistencia/justificar/",
        data=json_dumps({
            "gmail": AL2, "fecha": "2026-08-16",
            "tipoJustificacion": "certificado", "motivo": "X",
            "fechaPresentacion": "2026-08-17", "fechaInasistencia": "2026-08-16",
            "estado": "Pendiente", "certificado": "",
        }),
        content_type="application/json",
    )
    assert r.status_code == 403, "alumno no justifica por otro"


def test_admin_accede_alumnos_y_asistencia(client):
    _set_session(client, ADMIN)
    for curso in ("7A", "4B"):
        r = client.get(f"/api/alumnos/?curso={curso}")
        assert r.status_code == 200, f"admin ve {curso}"
    r = client.get("/api/asistencia/alumno/?gmail=" + AL1)
    assert r.status_code == 200, "admin accede al historial de cualquier alumno"


ANIO_TEST = "2026-08-16"  # se usa como fecha de prueba


def _clave_acta(curso, fecha="2026-08-16", anio="2026", turno="mañana", materia=""):
    """Reproduce el formato de clave de cuaderno.actas.clave_acta."""
    return "|".join([anio, "institucional", curso, fecha, turno, materia])


def test_actas_no_publicas_a_alumnos(client):
    """Las actas son documentación de la escuela: ningún alumno puede verlas."""
    # Un alumno sí tiene su propia asistencia (endpoint aparte), pero las actas
    # son documentos internos del cuerpo docente y debe rechazarlo siempre.
    _set_session(client, AL1)
    r = client.get("/api/asistencia/actas/")
    assert r.status_code == 403, f"alumno no lista actas (fue {r.status_code})"

    from urllib.parse import quote
    clave = quote(_clave_acta("7A"))
    for url in (f"/api/asistencia/actas/detalle/?clave={clave}",
                f"/api/asistencia/actas/pdf/?clave={clave}"):
        r = client.get(url)
        # 403 (no autorizado) y no 404: un alumno tampoco debe poder
        # distinguir si el acta existe o no.
        assert r.status_code == 403, f"alumno accede a {url} (fue {r.status_code})"


def test_actas_anónimo_401(client):
    client.cookies.clear()
    from urllib.parse import quote
    clave = quote(_clave_acta("7A"))
    for url in ("/api/asistencia/actas/",
                f"/api/asistencia/actas/detalle/?clave={clave}",
                f"/api/asistencia/actas/pdf/?clave={clave}"):
        r = client.get(url)
        assert r.status_code in (401, 403), f"anónimo accede a {url} (fue {r.status_code})"


def test_actas_403_antes_de_404(client):
    """El control de acceso va antes que la existencia del acta.

    Si se comprobara la existencia primero, un usuario sin permiso podría
    enumerar qué clases tienen acta archivada.
    """
    _set_session(client, AL1)
    from urllib.parse import quote
    clave = quote(_clave_acta("7A", fecha="2099-12-31"))  # no existe
    r = client.get(f"/api/asistencia/actas/detalle/?clave={clave}")
    assert r.status_code == 403, f"alumno obtiene 404 en vez de 403 (fue {r.status_code})"


def test_actas_preceptor_solo_su_curso(client):
    """Un preceptor no lee actas de cursos ajenos.

    Se devuelve 404 y no 403 a propósito: si el estado de respuesta
    distinguiera entre "no existe" y "no te corresponde", el preceptor podría
    enumerar en qué cursos se archivaron listas.
    """
    from urllib.parse import quote
    _set_session(client, PREC)  # preceptor de 7A
    r = client.get(f"/api/asistencia/actas/detalle/?clave={quote(_clave_acta('7B'))}")
    assert r.status_code == 404, f"preceptor lee el acta de un curso ajeno (fue {r.status_code})"


def test_actas_no_enumera_clases_archivadas(client):
    """Sin permisos, todas las claves devuelven 404 idéntico."""
    from urllib.parse import quote
    _set_session(client, PREC)
    # Dos cursos ajenos, ambos con y sin acta sembrada, deben verse iguales.
    TEST_DB["asistencia_actas"].delete_many({})
    TEST_DB["asistencia_actas"].insert_one({
        "clave": _clave_acta("7B"), "anioLectivo": "2026", "tipo": "institucional",
        "curso": "7B", "fecha": "2026-08-16", "turno": "mañana", "materia": "",
        "docentes": [], "alumnos": [], "resumen": {}, "version": 1,
    })
    con_acta = client.get(f"/api/asistencia/actas/detalle/?clave={quote(_clave_acta('7B'))}")
    sin_acta = client.get(f"/api/asistencia/actas/detalle/?clave={quote(_clave_acta('7C'))}")
    assert con_acta.status_code == sin_acta.status_code == 404, \
        "la respuesta no debe revelar si el acta existe"
    assert con_acta.json() == sin_acta.json(), \
        "el cuerpo de la respuesta no debe revelar si el acta existe"
    TEST_DB["asistencia_actas"].delete_many({})


def test_actas_pdf_requiere_acta_existente(client):
    from urllib.parse import quote
    _set_session(client, PREC)
    clave = quote(_clave_acta("7A", fecha="2099-01-01"))
    r = client.get(f"/api/asistencia/actas/pdf/?clave={clave}")
    assert r.status_code == 404, f"PDF de un acta inexistente (fue {r.status_code})"


def test_actas_sin_clave_400(client):
    _set_session(client, PREC)
    r = client.get("/api/asistencia/actas/detalle/")
    assert r.status_code == 400, f"detalle sin clave (fue {r.status_code})"


def test_pin_plano_rechazado(client):
    from cuaderno.auth import verificar_pin
    assert verificar_pin("1234", "texto-plano") is False, "PIN en texto plano NO debe validar"


def test_lockout_pin(client):
    # Precondición: el docente cargó una calificación para poder firmarla.
    a1 = TEST_DB.usuarios.find_one({"Gmail": AL1})
    TEST_DB.calificaciones.insert_one({
        "Curso": "7A", "Materia": "Matemática", "AlumnoGmail": AL1,
        "Cuatrimestre": 1, "Fila": 1,
        "Fecha": "2026-08-01", "Detalle": "TP", "FirmaDocente": "Prof. Test",
    })
    _set_session(client, AL1)
    for i in range(4):
        r = client.post(
            "/api/calificaciones/firmar/",
            data=json_dumps({"curso": "7A", "materia": "Matemática", "cuatrimestre": 1,
                             "fila": 1, "pin": "0000"}),
            content_type="application/json",
        )
        assert r.status_code == 400, f"intento {i+1} -> {r.status_code}"
    # 5to fallo: bloquea el PIN.
    r = client.post(
        "/api/calificaciones/firmar/",
        data=json_dumps({"curso": "7A", "materia": "Matemática", "cuatrimestre": 1,
                         "fila": 1, "pin": "0000"}),
        content_type="application/json",
    )
    assert r.status_code == 429, f"5to fallo debe bloquear (429), se obtuvo {r.status_code}"
    doc = TEST_DB.usuarios.find_one({"Gmail": AL1})
    assert doc.get("pin_habilitado") is False
    # Aún con el PIN correcto, sigue bloqueado.
    r = client.post(
        "/api/calificaciones/firmar/",
        data=json_dumps({"curso": "7A", "materia": "Matemática", "cuatrimestre": 1,
                         "fila": 1, "pin": "12345678"}),
        content_type="application/json",
    )
    assert r.status_code == 429, "PIN debe seguir bloqueado tras el lockout"


def test_password_politica(client):
    _set_session(client, ADMIN)
    r = client.post(
        "/api/cambiar-contrasena/",
        data=json_dumps({"actual": "contrasena123", "nueva": "1234", "repetir": "1234"}),
        content_type="application/json",
    )
    assert r.status_code == 400, "política mínima de 8 caracteres"
    r = client.post(
        "/api/cambiar-contrasena/",
        data=json_dumps({"actual": "contrasena123", "nueva": "12345678", "repetir": "12345678"}),
        content_type="application/json",
    )
    assert r.status_code == 400, "solo números no se permite"


def test_backup_path_traversal(client):
    _set_session(client, ADMIN)
    r = client.post(
        "/api/admin/backups/restaurar/",
        data=json_dumps({"nombre": "..\\..\\settings.py"}),
        content_type="application/json",
    )
    assert r.status_code == 404, "path traversal debe estar bloqueado (404)"


def test_sesion_expirada(client):
    _set_session_vencida(client, ADMIN)
    r = client.get("/api/cursos/")
    assert r.status_code == 401, "sesión vencida debe devolver 401 en /api/*"


def test_sesion_se_renueva_con_actividad(client):
    """Una sesión a punto de vencer NO debe cortarse si la persona sigue usando la app.

    La sesión va DENTRO de una cookie firmada. Django sólo la re-emite cuando
    la sesión se modifica, así que sin SESSION_SAVE_EVERY_REQUEST el navegador
    borraba la cookie a los 30 min aunque la persona siguiera cliqueando: la
    pantalla quedaba con lo ya cargado y el primer request nuevo (descargar un
    PDF) devolvía 401 "No autenticado". Este test fija la ventana deslizante.
    """
    _set_session(client, ADMIN)
    s = client.session
    # A un minuto de vencer, como el que llevaba 29 min trabajando.
    s["_expira"] = (datetime.now() + timedelta(minutes=1)).isoformat()
    s.save()
    client.cookies[settings.SESSION_COOKIE_NAME] = s.session_key
    antes = s["_expira"]

    r = client.get("/api/cursos/")
    assert r.status_code == 200, f"sesión activa fue cortada (fue {r.status_code})"

    despues = client.session.get("_expira")
    assert despues, "la sesión perdió el vencimiento"
    assert despues > antes, "el vencimiento no se renovó con la actividad"
    assert client.session.get("usuario_gmail") == ADMIN, "se perdió el usuario de la sesión"
    # Y la cookie se tiene que volver a emitir, si no el navegador la borra.
    assert settings.SESSION_SAVE_EVERY_REQUEST, \
        "sin SESSION_SAVE_EVERY_REQUEST la cookie firmada no se renueva"
    assert settings.SESSION_COOKIE_AGE >= 3600, \
        f"SESSION_COOKIE_AGE={settings.SESSION_COOKIE_AGE} es corto: la cookie se borra antes que la sesión"


def test_sesion_tiene_tope_absoluto(client):
    """La ventana deslizante no puede alargar la sesión para siempre."""
    _set_session(client, ADMIN)
    s = client.session
    s["_expira"] = (datetime.now() + timedelta(minutes=1)).isoformat()
    s.save()
    client.cookies[settings.SESSION_COOKIE_NAME] = s.session_key

    # Se renueva una vez y queda fijado el tope absoluto.
    client.get("/api/cursos/")
    tope = client.session.get("_expira_max")
    assert tope, "no se fijó el tope absoluto de sesión"
    cliente_tope = datetime.fromisoformat(tope)

    # Se simula que ya se pasó el tope: aunque la sesión "vuelva" a estar
    # vigente por actividad, tiene que cerrarse.
    s2 = client.session
    s2["_expira"] = (datetime.now() + timedelta(minutes=5)).isoformat()
    s2["_expira_max"] = (datetime.now() - timedelta(minutes=1)).isoformat()
    s2.save()
    client.cookies[settings.SESSION_COOKIE_NAME] = s2.session_key

    r = client.get("/api/cursos/")
    assert r.status_code == 401, f"sesión sin tope absoluto no se cerró (fue {r.status_code})"
    assert not client.session.get("usuario_gmail"), "la sesión no se limpió al vencer el tope"


def test_admin_crear_sin_1234(client):
    _set_session(client, ADMIN)
    r = client.post(
        "/api/admin/usuarios/crear/",
        data=json_dumps({"tipo": "Alumno", "apellido": "Nuevo", "nombres": "Test",
                         "curso": "7A", "password": ""}),
        content_type="application/json",
    )
    assert r.status_code == 400, "no se puede crear usuario sin contraseña (sin default 1234)"


def test_login_contrasena_incorrecta(client):
    r = client.post("/login/", {"Gmail": ADMIN, "password": "claveEquivocada123"})
    assert r.status_code == 200, r.status_code
    assert b"Credenciales incorrectas" in r.content, "mensaje genérico, no revela si el usuario existe"


def test_profesor_no_guarda_horario(client):
    _set_session(client, PROF)
    r = client.post(
        "/api/horarios/guardar/",
        data=json_dumps({"curso": "7A", "dias": {"Lunes": []}}),
        content_type="application/json",
    )
    assert r.status_code == 403, f"profesor no modifica el horario de preceptor: {r.status_code}"


def test_profesor_no_accede_admin(client):
    _set_session(client, PROF)
    r = client.get("/api/admin/dashboard/")
    assert r.status_code == 403, f"profesor no accede a funciones de admin: {r.status_code}"


def test_alumno_no_accede_admin(client):
    _set_session(client, AL1)
    r = client.get("/api/admin/dashboard/")
    assert r.status_code == 403, f"alumno no accede a funciones de admin: {r.status_code}"


def test_mongo_uri_usuario_dedicado(client):
    from config import db as db_mod
    old = dict(os.environ)
    try:
        os.environ.pop("MONGO_URI", None)
        os.environ["MONGO_USER"] = "cuaderno_app"
        os.environ["MONGO_PASSWORD"] = "p@ss:word"
        os.environ["MONGO_AUTH_SOURCE"] = "cuaderno_db"
        os.environ["MONGO_TLS"] = "True"
        os.environ["MONGO_TLS_CAFILE"] = "C:/certs/ca.pem"
        uri = db_mod.build_mongo_uri()
        assert "cuaderno_app:p%40ss%3Aword@" in uri, "usuario/pass codificados"
        assert "authSource=cuaderno_db" in uri, "authSource dedicado"
        assert "tls=true" in uri, "tls habilitado"
        assert "tlsCAFile=" in uri, "CA configurado"
        assert "tlsAllowInvalidCertificates" not in uri, "nunca desactivar verificación"
    finally:
        os.environ.clear()
        os.environ.update(old)


def test_tls_prohibido_inseguro_produccion(client):
    from config import db as db_mod
    old = dict(os.environ)
    try:
        os.environ.pop("MONGO_URI", None)
        os.environ["DJANGO_DEBUG"] = "False"
        os.environ["MONGO_TLS"] = "True"
        os.environ["MONGO_TLS_ALLOW_INSECURE"] = "True"
        try:
            db_mod.build_mongo_uri()
            raise AssertionError("no debería permitir certs inseguros en producción")
        except RuntimeError as e:
            assert "prohibido" in str(e)
    finally:
        os.environ.clear()
        os.environ.update(old)


def test_tls_obligatorio_produccion(client):
    from config import db as db_mod
    old = dict(os.environ)
    try:
        os.environ.pop("MONGO_URI", None)
        os.environ["DJANGO_DEBUG"] = "False"
        os.environ.pop("MONGO_TLS", None)
        os.environ.pop("MONGO_TLS_REQUIRED", None)
        try:
            db_mod.build_mongo_uri()
            raise AssertionError("producción sin TLS debería fallar")
        except RuntimeError as e:
            assert "requiere TLS" in str(e)
    finally:
        os.environ.clear()
        os.environ.update(old)


def test_secret_key_produccion(client):
    import subprocess
    env = dict(os.environ)
    env["SKIP_DOTENV"] = "1"
    env["DJANGO_DEBUG"] = "False"
    env["HTTPS"] = "True"
    env["DJANGO_ALLOWED_HOSTS"] = "midominio.edu.ar"
    env["MONGO_TLS"] = "True"
    env["MONGO_TLS_CAFILE"] = "C:/certs/ca.pem"
    env.pop("DJANGO_SECRET_KEY", None)
    codigo = (
        "import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); "
        "import django; django.setup()"
    )
    r = subprocess.run(
        [sys.executable, "-c", codigo], env=env, capture_output=True, text=True,
        cwd=str(Path(__file__).resolve().parent.parent),
    )
    assert r.returncode != 0, "producción sin SECRET_KEY debe fallar al arrancar"
    assert "DJANGO_SECRET_KEY" in (r.stderr + r.stdout), "mensaje de error claro"


def test_rotar_pins(client):
    import tempfile
    from scripts import rotar_pins

    # test_lockout_pin dejó el PIN de AL1 deshabilitado: lo re-habilitamos
    # para que vuelva a ser candidato.
    a1 = TEST_DB.usuarios.find_one({"Gmail": AL1})
    TEST_DB.usuarios.update_one(
        {"_id": a1["_id"]},
        {"$set": {"pin_habilitado": True, "pin_rotado": False, "pin_entregado": False}},
    )

    candidatos, ya_rotados, sin_pin, bloqueados = rotar_pins.clasificar_alumnos(TEST_DB)
    assert any(a["Gmail"] == AL1 for a in candidatos), "AL1 (con PIN) es candidato"
    assert all(a["Gmail"] != AL1 for a in sin_pin)

    with tempfile.TemporaryDirectory() as tmp:
        salida = str(Path(tmp) / "entrega_pins.txt")
        rotados, conflictos, errores = rotar_pins.aplicar(
            TEST_DB, candidatos, archivo_salida=salida, si=True
        )
        assert rotados == len(candidatos) and conflictos == 0 and errores == 0

        doc = TEST_DB.usuarios.find_one({"Gmail": AL1})
        assert str(doc["pinResponsable"]).startswith("$2"), "hash bcrypt"
        assert doc.get("pin_rotado") is True and doc.get("pin_entregado") is True

        c2, _, _, _ = rotar_pins.clasificar_alumnos(TEST_DB)
        assert all(a["Gmail"] != AL1 for a in c2), "re-run no re-rota lo ya entregado"

        lineas = Path(salida).read_text(encoding="utf-8").splitlines()
        assert any(AL1 in l for l in lineas), "el listado de entrega contiene a AL1"
        pin = [l.split("PIN nuevo: ")[1].split(" |")[0] for l in lineas if AL1 in l][0]
        assert bcrypt.checkpw(pin.encode("utf-8"), doc["pinResponsable"].encode("utf-8")), \
            "el PIN del archivo verifica contra el hash guardado"


def test_reset_admin_password(client):
    import reset_admin_password as rp
    from cuaderno.auth import verificar_contrasena

    gmail = "admin_reset@test.edu.ar"
    TEST_DB.usuarios.insert_one(_usuario(gmail, "Admin", None))

    assert rp.reset_admin_password("1234", gmail) is False, "política: mínimo 8"
    assert rp.reset_admin_password("nuevaSegura123", gmail) is True

    doc = TEST_DB.usuarios.find_one({"Gmail": gmail})
    assert str(doc["Contraseña"]).startswith("$2"), "hash bcrypt"
    assert verificar_contrasena("nuevaSegura123", doc["Contraseña"]) is True
    assert verificar_contrasena("claveVieja", doc["Contraseña"]) is False


def json_dumps(data):
    import json
    return json.dumps(data)


def main():
    setup()
    client = Client()
    pruebas = [
        test_login_generico,
        test_login_rate_limit_cuenta,
        test_login_sesion_rotada,
        test_idor_calificaciones,
        test_alumnos_por_curso_roles,
        test_crear_nota_autorrol_spoofed,
        test_nota_multi_destinatario_no_filtra_por_curso,
        test_nota_multi_destinatario_rechaza_alumno_ajeno,
        test_nota_lista_vacia_400,
        test_editar_nota_solo_autor,
        test_editar_nota_no_tras_firmar,
        test_alumno_no_crea_notas_multi,
        test_editar_nota_idor,
        test_alumnos_multiroles_permisos_or,
        test_alumnos_sin_asignacion_403,
        test_alumnos_curso_inexistente_404,
        test_alumnos_no_autenticado_401,
        test_alumnos_alumno_curso_ajeno_403,
        test_nota_curso_sin_permiso_403,
        test_nota_respuesta_usa_el_pin_del_alumno,
        test_nota_respuesta_mismo_pin_que_confirma,
        test_nota_respuesta_exige_pin,
        test_nota_respuesta_bloquea_el_pin_del_alumno,
        test_nota_respuesta_acerto_reinicia_el_contador,
        test_nota_respuesta_solo_destinatarios,
        test_nota_respuesta_idor_responder,
        test_nota_respuesta_bandeja_aislada,
        test_nota_ignora_pin_respuesta_del_remitente,
        test_nota_respuesta_pin_en_claro_no_viaja,
        test_asistencia_autorizacion,
        test_asistencia_no_pisa_materia_ajena,
        test_asistencia_guardar_rol_servidor,
        test_asistencia_alumno_idor,
        test_asistencia_justificar_no_autoaprobacion,
        test_admin_accede_alumnos_y_asistencia,
        test_actas_no_publicas_a_alumnos,
        test_actas_anónimo_401,
        test_actas_preceptor_solo_su_curso,
        test_actas_no_enumera_clases_archivadas,
        test_actas_pdf_requiere_acta_existente,
        test_pin_plano_rechazado,
        test_lockout_pin,
        test_password_politica,
        test_backup_path_traversal,
        test_sesion_expirada,
        test_sesion_se_renueva_con_actividad,
        test_sesion_tiene_tope_absoluto,
        test_admin_crear_sin_1234,
        test_login_contrasena_incorrecta,
        test_profesor_no_guarda_horario,
        test_profesor_no_accede_admin,
        test_alumno_no_accede_admin,
        test_mongo_uri_usuario_dedicado,
        test_tls_prohibido_inseguro_produccion,
        test_tls_obligatorio_produccion,
        test_secret_key_produccion,
        test_rotar_pins,
        test_reset_admin_password,
    ]
    fallos = 0
    for t in pruebas:
        try:
            t(client)
            print(f"  OK  {t.__name__}")
        except AssertionError as e:
            fallos += 1
            print(f"FAIL  {t.__name__}: {e}")
        except Exception as e:
            fallos += 1
            print(f"ERROR {t.__name__}: {e!r}")
    limpiar()
    print(f"\nResultado: {len(pruebas) - fallos}/{len(pruebas)} pruebas OK")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
