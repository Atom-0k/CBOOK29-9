"""Tests de autorización y carga de alumnos.

Se ejecutan con: python -m unittest cuaderno.tests -v
"""
import os
import unittest
from unittest.mock import patch, MagicMock

import json as _json

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.test import SimpleTestCase, override_settings

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


def _json_resp(resp):
    """Decodifica el contenido de un JsonResponse de Django."""
    return _json.loads(resp.content)

# ---------------------------------------------------------------------------
# Stub: colección en memoria (sin dependencias externas)
# ---------------------------------------------------------------------------

class _FakeCursor(list):
    """Lista que imita la API de Cursor de pymongo 3.x.

    `sort()` recibe sólo las claves y `limit()` va encadenado aparte: si el
    código de producción usara la firma de pymongo 4, el fake lo rechaza.
    """

    def sort(self, key_or_list=None, direction=None):
        lista = list(self)
        if isinstance(key_or_list, str):
            claves = [(key_or_list, direction or 1)]
        else:
            claves = list(key_or_list or [])
        for campo, orden in reversed(claves):
            lista.sort(key=lambda d: (d.get(campo) is None, _ordenable(d.get(campo))),
                       reverse=orden < 0)
        self[:] = lista
        return self

    def limit(self, n):
        self[:] = self[:n]
        return self


def _ordenable(valor):
    """Comparable entre tipos distintos, para no romper el sort."""
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return str(valor)
    if isinstance(valor, (int, float)):
        return f"{valor:020.6f}"
    return str(valor)


class _FakeCollection:
    """Colección en memoria para simular pymongo."""

    def __init__(self):
        self._docs = []
        self._indices = []
        self._seq = 0

    def create_index(self, *args, **kwargs):
        self._indices.append((args, kwargs))
        return args[0] if args else kwargs.get("key")

    def find_one(self, filtro=None):
        for d in self._docs:
            if self._match(d, filtro or {}):
                return dict(d)
        return None

    def find(self, filtro=None, projection=None):
        return _FakeCursor(dict(d) for d in self._docs if self._match(d, filtro or {}))

    def count_documents(self, filtro=None):
        return len(list(self.find(filtro)))

    def insert_one(self, doc):
        # Como pymongo, todo documento insertado recibe un _id.
        self._seq += 1
        doc = dict(doc)
        doc.setdefault("_id", self._seq)
        self._checar_indices_unicos(doc)
        self._docs.append(doc)

    def _checar_indices_unicos(self, doc):
        """Replica el error de clave duplicada de un índice unique.

        Sin esto, un código que sólo se apoya en el índice único en vez de
        comprobar la clave explícitamente parecería funcionar en las pruebas.
        """
        for args, kwargs in self._indices:
            if not kwargs.get("unique"):
                continue
            clave = args[0] if args else kwargs.get("key")
            campos = [clave] if isinstance(clave, str) else [c[0] for c in clave]
            valores = tuple(doc.get(c) for c in campos)
            for d in self._docs:
                if tuple(d.get(c) for c in campos) == valores:
                    raise DuplicateKeyError(f"índice unique duplicado en {campos}: {valores}")

    def update_one(self, filtro, update):
        for d in self._docs:
            if self._match(d, filtro):
                if "$set" in update:
                    d.update(update["$set"])
                if "$addToSet" in update:
                    for campo, valor in update["$addToSet"].items():
                        actual = d.setdefault(campo, [])
                        if isinstance(actual, list) and valor not in actual:
                            actual.append(valor)
                if "$push" in update:
                    for campo, valor in update["$push"].items():
                        d.setdefault(campo, []).append(valor)
                return

    def update_many(self, filtro, update):
        for d in self._docs:
            if self._match(d, filtro or {}):
                if "$set" in update:
                    d.update(update["$set"])

    def replace_one(self, filtro, doc, upsert=False):
        for i, d in enumerate(self._docs):
            if self._match(d, filtro or {}):
                self._docs[i] = dict(doc)
                return
        if upsert:
            self._docs.append(dict(doc))

    def delete_many(self, filtro=None):
        self._docs = [d for d in self._docs if not self._match(d, filtro or {})]

    @staticmethod
    def _match(doc, filtro):
        for k, v in filtro.items():
            # Operadores lógicos. Antes se ignoraban en silencio, lo que hacía
            # que cualquier consulta con $or no matcheara nunca y los tests
            # dieran verde sobre código roto.
            if k == "$or":
                if not any(_FakeCollection._match(doc, c) for c in v):
                    return False
                continue
            if k == "$and":
                if not all(_FakeCollection._match(doc, c) for c in v):
                    return False
                continue
            if k == "$nor":
                if any(_FakeCollection._match(doc, c) for c in v):
                    return False
                continue
            if isinstance(v, dict):
                if "$ne" in v and doc.get(k) == v["$ne"]:
                    return False
                if "$exists" in v and v["$exists"] is False and k in doc:
                    return False
                if "$exists" in v and v["$exists"] is True and k not in doc:
                    return False
                for op, operand in v.items():
                    if op in ("$ne", "$exists"):
                        continue
                    actual = doc.get(k)
                    if op == "$gt" and not (actual is not None and _ordenable(actual) > _ordenable(operand)):
                        return False
                    if op == "$gte" and not (actual is not None and _ordenable(actual) >= _ordenable(operand)):
                        return False
                    if op == "$lt" and not (actual is not None and _ordenable(actual) < _ordenable(operand)):
                        return False
                    if op == "$lte" and not (actual is not None and _ordenable(actual) <= _ordenable(operand)):
                        return False
                    if op == "$in" and actual not in operand:
                        return False
                    if op == "$nin" and actual in operand:
                        return False
            else:
                if doc.get(k) != v:
                    return False
        return True


class _FakeDB:
    """Base de datos en memoria con colecciones nombradas."""

    def __init__(self):
        self._cols = {}

    def __getitem__(self, name):
        if name not in self._cols:
            self._cols[name] = _FakeCollection()
        return self._cols[name]


# ---------------------------------------------------------------------------
# Fixtures de datos
# ---------------------------------------------------------------------------

Curso4B_ID = ObjectId("64a1a1a1a1a1a1a1a1a1a1a1")
Curso4A_ID = ObjectId("64a1a1a1a1a1a1a1a1a1a1a2")
Curso5A_ID = ObjectId("64a1a1a1a1a1a1a1a1a1a1a3")
Curso6B_ID = ObjectId("64a1a1a1a1a1a1a1a1a1a1a4")

USUARIOS = [
    {
        "_id": ObjectId("64b000000000000000000001"),
        "Gmail": "prof.4b@insi.edu.ar",
        "Nombres": "Carlos",
        "Apellido": "García",
        "Curso": "",
        "Rol": "Profesor",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000002"),
        "Gmail": "prec.4a@insi.edu.ar",
        "Nombres": "Laura",
        "Apellido": "Martínez",
        "Curso": "",
        "Rol": "Preceptor",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000003"),
        "Gmail": "mixto@insi.edu.ar",
        "Nombres": "Pedro",
        "Apellido": "López",
        "Curso": "",
        "Rol": ["Profesor", "Preceptor"],
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000004"),
        "Gmail": "admin@insi.edu.ar",
        "Nombres": "Admin",
        "Apellido": "General",
        "Curso": "",
        "Rol": "Admin",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000010"),
        "Gmail": "alumno1.4b@insi.edu.ar",
        "Nombres": "Juan",
        "Apellido": "Pérez",
        "Curso": "4B",
        "Rol": "Alumno",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000011"),
        "Gmail": "alumno2.4b@insi.edu.ar",
        "Nombres": "María",
        "Apellido": "Rodríguez",
        "Curso": "4B",
        "Rol": "Alumno",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000020"),
        "Gmail": "alumno1.4a@insi.edu.ar",
        "Nombres": "Ana",
        "Apellido": "Torres",
        "Curso": "4A",
        "Rol": "Alumno",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000030"),
        "Gmail": "alumni.baja.4b@insi.edu.ar",
        "Nombres": "Baja",
        "Apellido": "Test",
        "Curso": "4B",
        "Rol": "Alumno",
        "estado": "Baja",
    },
    {
        "_id": ObjectId("64b000000000000000000005"),
        "Gmail": "prec.vacio@insi.edu.ar",
        "Nombres": "Sin",
        "Apellido": "Asignaciones",
        "Curso": "",
        "Rol": "Preceptor",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000006"),
        "Gmail": "dual@insi.edu.ar",
        "Nombres": "Dual",
        "Apellido": "Roles",
        "Curso": "",
        "Rol": ["Profesor", "Preceptor"],
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000012"),
        "Gmail": "alumno1.6b@insi.edu.ar",
        "Nombres": "Luis",
        "Apellido": "Gómez",
        "Curso": "6B",
        "Rol": "Alumno",
        "estado": "Activo",
    },
    {
        "_id": ObjectId("64b000000000000000000013"),
        "Gmail": "alumno2.6b@insi.edu.ar",
        "Nombres": "Sofía",
        "Apellido": "Díaz",
        "Curso": "6B",
        "Rol": "Alumno",
        "estado": "Activo",
    },
]

CURSOS = [
    {"_id": Curso4B_ID, "nombre": "4B"},
    {"_id": Curso4A_ID, "nombre": "4A"},
    {"_id": Curso5A_ID, "nombre": "5A"},
    {"_id": Curso6B_ID, "nombre": "6B"},
]

ASIGNACIONES = [
    {
        "_id": ObjectId("64c000000000000000000010"),
        "usuario_id": ObjectId("64b000000000000000000001"),
        "curso_id": Curso4B_ID,
        "materia": "Educación Física",
    },
    {
        "_id": ObjectId("64c000000000000000000011"),
        "usuario_id": ObjectId("64b000000000000000000002"),
        "curso_id": Curso4A_ID,
        "materia": None,
    },
    {
        "_id": ObjectId("64c000000000000000000012"),
        "usuario_id": ObjectId("64b000000000000000000003"),
        "curso_id": Curso4B_ID,
        "materia": "Química",
    },
    {
        "_id": ObjectId("64c000000000000000000013"),
        "usuario_id": ObjectId("64b000000000000000000003"),
        "curso_id": Curso5A_ID,
        "materia": None,
    },
    {
        "_id": ObjectId("64c000000000000000000001"),
        "usuario_id": ObjectId("64b000000000000000000006"),
        "curso_id": Curso6B_ID,
        "materia": "Educación Física",
    },
    {
        "_id": ObjectId("64c000000000000000000002"),
        "usuario_id": ObjectId("64b000000000000000000006"),
        "curso_id": Curso6B_ID,
        "materia": None,
    },
]


def _populate(db):
    for u in USUARIOS:
        db["usuarios"].insert_one(u)
    for c in CURSOS:
        db["cursos"].insert_one(c)
    for a in ASIGNACIONES:
        db["asignaciones"].insert_one(a)


def _make_db():
    db = _FakeDB()
    _populate(db)
    return db


# ---------------------------------------------------------------------------
# Tests: get_roles
# ---------------------------------------------------------------------------

class TestGetRoles(unittest.TestCase):

    def test_rol_string(self):
        from cuaderno.auth import get_roles
        self.assertEqual(get_roles({"Rol": "Profesor"}), ["Profesor"])

    def test_rol_lista(self):
        from cuaderno.auth import get_roles
        self.assertEqual(
            get_roles({"Rol": ["Profesor", "Preceptor"]}),
            ["Profesor", "Preceptor"],
        )

    def test_rol_none(self):
        from cuaderno.auth import get_roles
        self.assertEqual(get_roles({"Rol": None}), ["Alumno"])

    def test_rol_vacio(self):
        from cuaderno.auth import get_roles
        self.assertEqual(get_roles({"Rol": ""}), ["Alumno"])

    def test_doc_none(self):
        from cuaderno.auth import get_roles
        self.assertEqual(get_roles(None), ["Alumno"])

    def test_rol_case_insensitive(self):
        from cuaderno.auth import get_roles
        self.assertEqual(get_roles({"Rol": "preceptor"}), ["Preceptor"])


# ---------------------------------------------------------------------------
# Tests: puede_acceder_alumnos_curso
# ---------------------------------------------------------------------------

class TestPuedeAccederAlumnosCurso(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_admin_accede_a_cualquier_curso(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("admin@insi.edu.ar", "4B"))
        self.assertTrue(puede_acceder_alumnos_curso("admin@insi.edu.ar", "4A"))
        self.assertTrue(puede_acceder_alumnos_curso("admin@insi.edu.ar", "99X"))

    def test_profesor_accede_a_su_curso_asignado(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("prof.4b@insi.edu.ar", "4B"))

    def test_profesor_no_accede_a_curso_no_asignado(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("prof.4b@insi.edu.ar", "4A"))

    def test_preceptor_accede_a_su_curso(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("prec.4a@insi.edu.ar", "4A"))

    def test_preceptor_no_accede_a_curso_no_asignado(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("prec.4a@insi.edu.ar", "4B"))

    def test_preceptor_sin_asignaciones_no_accede(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("prec.vacio@insi.edu.ar", "4B"))

    def test_mixto_accede_como_profesor(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("mixto@insi.edu.ar", "4B"))

    def test_mixto_accede_como_preceptor(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("mixto@insi.edu.ar", "5A"))

    def test_mixto_no_accede_a_curso_no_asignado(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("mixto@insi.edu.ar", "4A"))

    def test_usuario_inexistente_no_accede(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("noexiste@insi.edu.ar", "4B"))

    def test_curso_vacio_no_accede(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertFalse(puede_acceder_alumnos_curso("prof.4b@insi.edu.ar", ""))


# ---------------------------------------------------------------------------
# Tests: can_acceder_alumno
# ---------------------------------------------------------------------------

class TestCanAccederAlumno(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_profesor_accede_a_alumno_de_su_curso(self):
        from cuaderno.auth import can_acceder_alumno
        self.assertTrue(
            can_acceder_alumno("prof.4b@insi.edu.ar", "alumno1.4b@insi.edu.ar", "4B", "Educación Física")
        )

    def test_profesor_no_accede_a_alumno_de_otro_curso(self):
        from cuaderno.auth import can_acceder_alumno
        self.assertFalse(
            can_acceder_alumno("prof.4b@insi.edu.ar", "alumno1.4a@insi.edu.ar", "4A", "Educación Física")
        )

    def test_preceptor_accede_a_alumno_de_su_curso(self):
        from cuaderno.auth import can_acceder_alumno
        self.assertTrue(
            can_acceder_alumno("prec.4a@insi.edu.ar", "alumno1.4a@insi.edu.ar", "4A")
        )

    def test_alumno_puede_ver_sus_propios_datos(self):
        from cuaderno.auth import can_acceder_alumno
        self.assertTrue(
            can_acceder_alumno("alumno1.4b@insi.edu.ar", "alumno1.4b@insi.edu.ar", "4B")
        )

    def test_mixto_profesor_accede_a_alumno_4b(self):
        from cuaderno.auth import can_acceder_alumno
        self.assertTrue(
            can_acceder_alumno("mixto@insi.edu.ar", "alumno1.4b@insi.edu.ar", "4B", "Química")
        )


# ---------------------------------------------------------------------------
# Tests: alumno_de_curso
# ---------------------------------------------------------------------------

class TestAlumnoDeCurso(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_alumno_real_del_curso(self):
        from cuaderno.auth import alumno_de_curso
        self.assertTrue(alumno_de_curso("alumno1.4b@insi.edu.ar", "4B"))

    def test_alumno_de_otro_curso(self):
        from cuaderno.auth import alumno_de_curso
        self.assertFalse(alumno_de_curso("alumno1.4b@insi.edu.ar", "4A"))

    def test_alumno_de_baja(self):
        from cuaderno.auth import alumno_de_curso
        self.assertFalse(alumno_de_curso("alumni.baja.4b@insi.edu.ar", "4B"))

    def test_profesor_no_es_alumno(self):
        from cuaderno.auth import alumno_de_curso
        self.assertFalse(alumno_de_curso("prof.4b@insi.edu.ar", "4B"))

    def test_gmail_vacio(self):
        from cuaderno.auth import alumno_de_curso
        self.assertFalse(alumno_de_curso("", "4B"))

    def test_curso_vacio(self):
        from cuaderno.auth import alumno_de_curso
        self.assertFalse(alumno_de_curso("alumno1.4b@insi.edu.ar", ""))


# ---------------------------------------------------------------------------
# Tests: cursos_profesor / cursos_preceptor
# ---------------------------------------------------------------------------

class TestCursosProfesorYPreceptor(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_cursos_profesor(self):
        from cuaderno.auth import cursos_profesor
        self.assertEqual(cursos_profesor("prof.4b@insi.edu.ar"), {"4B"})

    def test_cursos_profesor_multirole(self):
        from cuaderno.auth import cursos_profesor
        self.assertEqual(cursos_profesor("mixto@insi.edu.ar"), {"4B"})

    def test_cursos_preceptor(self):
        from cuaderno.auth import cursos_preceptor
        self.assertEqual(cursos_preceptor("prec.4a@insi.edu.ar"), {"4A"})

    def test_cursos_preceptor_multirole(self):
        from cuaderno.auth import cursos_preceptor
        self.assertEqual(cursos_preceptor("mixto@insi.edu.ar"), {"5A"})

    def test_cursos_profesor_vacio_si_no_tiene_materia(self):
        from cuaderno.auth import cursos_profesor
        self.assertEqual(cursos_profesor("prec.4a@insi.edu.ar"), set())

    def test_cursos_preceptor_vacio_si_no_tiene_asignacion_sin_materia(self):
        from cuaderno.auth import cursos_preceptor
        self.assertEqual(cursos_preceptor("prof.4b@insi.edu.ar"), set())

    def test_usuario_inexistente(self):
        from cuaderno.auth import cursos_profesor, cursos_preceptor
        self.assertEqual(cursos_profesor("noexiste@insi.edu.ar"), set())
        self.assertEqual(cursos_preceptor("noexiste@insi.edu.ar"), set())


# ---------------------------------------------------------------------------
# Tests: GET /api/alumnos/ (endpoint con RequestFactory)
# ---------------------------------------------------------------------------

class TestApiAlumnosPorCurso(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_views = cuaderno.views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.views, "_mongo_db", self._orig_views)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _get(self, params, gmail=None):
        from cuaderno.views import api_alumnos_por_curso
        request = self.factory.get("/api/alumnos/", params)
        if gmail:
            request.session = {"usuario_gmail": gmail}
        else:
            request.session = {}
        return api_alumnos_por_curso(request)

    # --- Casos exitosos ---

    def test_profesor_4b_alumnos_4b_200(self):
        resp = self._get({"curso": "4B"}, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        data = _json_resp(resp)
        gmails = {a["gmail"] for a in data["alumnos"]}
        self.assertIn("alumno1.4b@insi.edu.ar", gmails)
        self.assertIn("alumno2.4b@insi.edu.ar", gmails)

    def test_preceptor_4a_alumnos_4a_200(self):
        resp = self._get({"curso": "4A"}, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_mixto_profesor_4b_200(self):
        resp = self._get({"curso": "4B"}, "mixto@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_mixto_preceptor_5a_200(self):
        resp = self._get({"curso": "5A"}, "mixto@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_admin_accede_a_cualquier_curso(self):
        for curso in ("4B", "4A", "5A"):
            resp = self._get({"curso": curso}, "admin@insi.edu.ar")
            self.assertEqual(resp.status_code, 200, f"Admin debería acceder a {curso}")

    # --- Denegaciones ---

    def test_profesor_4b_alumnos_4a_403(self):
        resp = self._get({"curso": "4A"}, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_preceptor_4a_alumnos_4b_403(self):
        resp = self._get({"curso": "4B"}, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_mixto_no_accede_a_4a(self):
        resp = self._get({"curso": "4A"}, "mixto@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_preceptor_sin_asignaciones_403(self):
        resp = self._get({"curso": "4B"}, "prec.vacio@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    # --- Autenticación ---

    def test_no_autenticado_401(self):
        resp = self._get({"curso": "4B"})
        self.assertEqual(resp.status_code, 401)

    # --- Curso ---

    def test_curso_inexistente_404(self):
        resp = self._get({"curso": "99X"}, "admin@insi.edu.ar")
        self.assertEqual(resp.status_code, 404)

    def test_curso_vacio_devuelve_lista_vacia(self):
        resp = self._get({}, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(_json_resp(resp)["alumnos"], [])

    # --- Integridad de datos ---

    def test_alumno_baja_no_aparece(self):
        resp = self._get({"curso": "4B"}, "admin@insi.edu.ar")
        gmails = {a["gmail"] for a in _json_resp(resp)["alumnos"]}
        self.assertNotIn("alumni.baja.4b@insi.edu.ar", gmails)

    def test_no_devuelve_alumnos_de_otro_curso(self):
        resp = self._get({"curso": "4B"}, "admin@insi.edu.ar")
        gmails = {a["gmail"] for a in _json_resp(resp)["alumnos"]}
        self.assertNotIn("alumno1.4a@insi.edu.ar", gmails)

    # --- Mensaje de error ---

    def test_403_tiene_mensaje_claro(self):
        resp = self._get({"curso": "4B"}, "prec.4a@insi.edu.ar")
        data = _json_resp(resp)
        self.assertIn("error", data)
        self.assertIn("autorización", data["error"].lower())

    def test_404_tiene_mensaje_claro(self):
        resp = self._get({"curso": "99X"}, "admin@insi.edu.ar")
        data = _json_resp(resp)
        self.assertIn("error", data)


# ---------------------------------------------------------------------------
# Tests: POST /api/notas/crear/
# ---------------------------------------------------------------------------

class TestNotaMultiDestinatario(unittest.TestCase):
    """Envío de una misma nota a varios alumnos a la vez.

    El modelo elegido es una sola nota con la lista `alumnos` de destinatarios,
    en vez de una nota por persona: así el texto se escribe una vez y se puede
    corregir una vez. El riesgo de ese modelo es obvio y es lo que más se
    prueba acá: que un alumno del curso NO seleccionado no vea la nota ni
    pueda firmarla.
    """

    CURSO = "4A"
    PRECEPTOR = "prec.4a@insi.edu.ar"
    AL1 = "alumno1.4a@insi.edu.ar"
    AL2 = "alumno2.4a@insi.edu.ar"
    AL3 = "alumno3.4a@insi.edu.ar"
    AL4 = "alumno4.4a@insi.edu.ar"

    def setUp(self):
        self._db = _make_db()
        # 4A viene con un solo alumno en el fixture; para probar la selección
        # múltiple se agregan tres más.
        for gmail, nombres, apellido in (
            (self.AL2, "Belén", "Sosa"),
            (self.AL3, "Carla", "Méndez"),
            (self.AL4, "Diego", "Ponce"),
        ):
            self._db["usuarios"].insert_one({
                "Gmail": gmail, "Nombres": nombres, "Apellido": apellido,
                "Curso": self.CURSO, "Rol": "Alumno", "estado": "Activo",
                "pinResponsable": "hash", "pin_habilitado": True,
            })
        self._db["usuarios"].update_one(
            {"Gmail": self.AL1},
            {"$set": {"pinResponsable": "hash", "pin_habilitado": True}},
        )

        import cuaderno.views
        import cuaderno.auth
        for modulo in (cuaderno.auth, cuaderno.views):
            self.addCleanup(setattr, modulo, "_mongo_db", modulo._mongo_db)
            modulo._mongo_db = self._db
        from django.test import RequestFactory
        self.factory = RequestFactory()

    # --- helpers ------------------------------------------------------------

    def _crear(self, destinatarios=None, **extra):
        import json
        from cuaderno.views import api_crear_nota
        body = {
            "curso": self.CURSO, "tipo": "comunicado",
            "titulo": "Titulo", "contenido": "Contenido",
        }
        if destinatarios is not None:
            body["destinatarios"] = destinatarios
        body.update(extra)
        request = self.factory.post("/api/notas/crear/", data=json.dumps(body),
                                    content_type="application/json")
        request.session = {"usuario_gmail": self.PRECEPTOR}
        respuesta = api_crear_nota(request)
        # El fake asigna un _id entero; las vistas buscan por ObjectId, así que
        # se reemplaza por uno real para poder firmar y editar.
        if self._db["notas"]._docs:
            self._db["notas"]._docs[-1]["_id"] = ObjectId("64b00000000000000000aa01")
        return respuesta

    def _nota(self):
        return self._db["notas"]._docs[-1]

    def _notas_de(self, gmail):
        from cuaderno.views import _get_notas_alumno
        return _get_notas_alumno(gmail, self.CURSO)

    def _firmar(self, nota_id, gmail, pin="1234"):
        import json
        from unittest.mock import patch
        from cuaderno.views import api_confirmar_nota
        request = self.factory.post("/api/notas/confirmar/",
                                    data=json.dumps({"notaId": str(nota_id), "pin": pin}),
                                    content_type="application/json")
        request.session = {"usuario_gmail": gmail}
        with patch("cuaderno.views.verificar_pin", return_value=True), \
             patch("cuaderno.views.pin_limite_ip", return_value=(True, None)):
            return api_confirmar_nota(request)

    # --- cómo se guarda -----------------------------------------------------

    def test_varios_alumnos_guarda_la_lista(self):
        resp = self._crear([self.AL1, self.AL2, self.AL3])
        self.assertEqual(resp.status_code, 200)
        nota = self._nota()
        self.assertIsNone(nota["AlumnoGmail"])
        self.assertEqual(nota["alumnos"], [self.AL1, self.AL2, self.AL3])

    def test_una_sola_nota_para_todos_los_seleccionados(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        # El punto del cambio: no se crea una nota por alumno.
        notas_del_curso = [n for n in self._db["notas"]._docs if n.get("Curso") == self.CURSO]
        self.assertEqual(len(notas_del_curso), 1)

    def test_un_alumno_solo_usa_la_forma_antigua(self):
        # Con uno solo se guarda como nota individual, igual que antes.
        self._crear([self.AL1])
        nota = self._nota()
        self.assertEqual(nota["AlumnoGmail"], self.AL1)
        self.assertIsNone(nota.get("alumnos"))

    def test_seleccionar_todos_equivale_a_todo_el_curso(self):
        self._crear([self.AL1, self.AL2, self.AL3, self.AL4])
        nota = self._nota()
        # Sin lista: así un alumno que se sume después también la ve.
        self.assertIsNone(nota.get("alumnos"))
        self.assertIsNone(nota["AlumnoGmail"])

    def test_todos_menos_uno_es_un_subconjunto(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        self.assertEqual(sorted(self._nota()["alumnos"]),
                         sorted([self.AL1, self.AL2, self.AL3]))

    def test_la_forma_antigua_sigue_andando(self):
        resp = self._crear(None, destinatario="curso")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(self._nota()["AlumnoGmail"])

    def test_la_forma_antigua_con_un_alumno(self):
        resp = self._crear(None, destinatario=self.AL1)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._nota()["AlumnoGmail"], self.AL1)

    def test_pin_sobre_un_grupo(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        nota = self._nota()
        self.assertTrue(nota["requierePin"])
        self.assertEqual(nota["firmas"], [])
        # La lista de alumnos es la que hay que firmar, no todo el curso.
        self.assertEqual(nota["alumnos"], [self.AL1, self.AL2])

    def test_pin_sobre_todo_el_curso_arma_la_lista_completa(self):
        self._crear([self.AL1, self.AL2, self.AL3, self.AL4], requierePin=True)
        self.assertEqual(sorted(self._nota()["alumnos"]),
                         sorted([self.AL1, self.AL2, self.AL3, self.AL4]))

    def test_el_texto_se_escribe_una_sola_vez(self):
        # Todos los destinatarios comparten exactamente el mismo contenido.
        self._crear([self.AL1, self.AL2, self.AL3], titulo="Reunión de padres")
        nota = self._nota()
        for gmail in nota["alumnos"]:
            self.assertEqual(nota["Titulo"], "Reunión de padres")
            self.assertIn(gmail, nota["alumnos"])

    # --- validación ---------------------------------------------------------

    def test_lista_vacia_400(self):
        self.assertEqual(self._crear([]).status_code, 400)

    def test_no_escribe_si_no_eligio_a_nadie(self):
        self._crear([])
        self.assertEqual(self._db["notas"]._docs, [])

    def test_alumno_de_otro_curso_no_se_cuela(self):
        resp = self._crear([self.AL1, "alumno1.4b@insi.edu.ar"])
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self._db["notas"]._docs, [])

    def test_gmail_inexistente_no_se_cuela(self):
        self.assertEqual(self._crear([self.AL1, "fantasma@insi.edu.ar"]).status_code, 400)

    def test_duplicados_se_deduplican(self):
        resp = self._crear([self.AL1, self.AL2, self.AL1, self.AL2])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(sorted(self._nota()["alumnos"]), sorted([self.AL1, self.AL2]))

    def test_espacios_en_los_gmail(self):
        self._crear([f" {self.AL1} ", self.AL2])
        self.assertEqual(self._nota()["alumnos"], [self.AL1, self.AL2])

    def test_destinatarios_debe_ser_lista(self):
        self.assertEqual(self._crear("curso").status_code, 400)

    def test_no_puede_mandar_a_curso_sin_permiso(self):
        import json
        from cuaderno.views import api_crear_nota
        request = self.factory.post("/api/notas/crear/", data=json.dumps({
            "curso": "4B", "destinatarios": ["alumno1.4b@insi.edu.ar"],
            "tipo": "comunicado", "titulo": "T", "contenido": "C",
        }), content_type="application/json")
        request.session = {"usuario_gmail": self.PRECEPTOR}
        self.assertEqual(api_crear_nota(request).status_code, 403)

    def test_alumno_no_puede_crear_notas(self):
        import json
        from cuaderno.views import api_crear_nota
        request = self.factory.post("/api/notas/crear/", data=json.dumps({
            "curso": self.CURSO, "destinatarios": [self.AL1, self.AL2],
            "tipo": "comunicado", "titulo": "T", "contenido": "C",
        }), content_type="application/json")
        request.session = {"usuario_gmail": self.AL1}
        self.assertEqual(api_crear_nota(request).status_code, 403)

    # --- VISIBILIDAD: lo que no se puede ver (lo más importante) -----------

    def test_los_seleccionados_ven_la_nota(self):
        self._crear([self.AL1, self.AL2])
        for gmail in (self.AL1, self.AL2):
            titulos = [n["titulo"] for n in self._notas_de(gmail)]
            self.assertIn("Titulo", titulos, f"{gmail} debe ver la nota")

    def test_los_no_seleccionados_NO_ven_la_nota(self):
        # Este es el corazón del cambio: el filtro de curso trae la nota,
        # pero la lista de alumnos la tiene que excluir.
        self._crear([self.AL1, self.AL2])
        titulos = [n["titulo"] for n in self._notas_de(self.AL3)]
        self.assertNotIn("Titulo", titulos, "un alumno fuera del grupo no debe ver la nota")
        self.assertNotIn("Titulo", [n["titulo"] for n in self._notas_de(self.AL4)])

    def test_nota_individual_sigue_siendo_privada(self):
        self._crear([self.AL1])
        self.assertEqual([n["titulo"] for n in self._notas_de(self.AL1)], ["Titulo"])
        self.assertEqual(self._notas_de(self.AL2), [])

    def test_nota_a_todo_el_curso_la_ven_todos(self):
        self._crear([self.AL1, self.AL2, self.AL3, self.AL4])
        for gmail in (self.AL1, self.AL2, self.AL3, self.AL4):
            self.assertEqual([n["titulo"] for n in self._notas_de(gmail)], ["Titulo"])

    def test_dos_grupos_distintos_no_se_mezclan(self):
        self._crear([self.AL1, self.AL2], titulo="Grupo A")
        self._crear([self.AL3, self.AL4], titulo="Grupo B")
        self.assertEqual([n["titulo"] for n in self._notas_de(self.AL1)], ["Grupo A"])
        self.assertEqual([n["titulo"] for n in self._notas_de(self.AL3)], ["Grupo B"])

    # --- FIRMA: no se puede firmar la nota de otro --------------------------

    def test_fuera_del_grupo_no_puede_firmar(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        nota = self._nota()
        resp = self._firmar(nota["_id"], self.AL3)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._nota()["firmas"], [])

    def test_dentro_del_grupo_si_puede_firmar(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        resp = self._firmar(self._nota()["_id"], self.AL1)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._nota()["firmas"], [self.AL1])

    def test_confirmada_por_alumno_es_individual(self):
        # Firma AL1; para AL2 la nota sigue sin confirmarse.
        self._crear([self.AL1, self.AL2], requierePin=True)
        self._firmar(self._nota()["_id"], self.AL1)
        def confirmada_de(gmail):
            return [n["confirmada"] for n in self._notas_de(gmail) if n["titulo"] == "Titulo"]
        self.assertEqual(confirmada_de(self.AL1), [True])
        self.assertEqual(confirmada_de(self.AL2), [False])

    def test_confirmada_tras_firmar_todos(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        self._firmar(self._nota()["_id"], self.AL1)
        self._firmar(self._nota()["_id"], self.AL2)
        nota = self._nota()
        self.assertTrue(nota["confirmada"])
        self.assertTrue(nota["todosFirmaron"])
        self.assertEqual(sorted(nota["firmas"]), sorted([self.AL1, self.AL2]))

    def test_firmar_dos_veces_no_duplica(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        self._firmar(self._nota()["_id"], self.AL1)
        self._firmar(self._nota()["_id"], self.AL1)
        self.assertEqual(self._nota()["firmas"], [self.AL1])

    def test_firma_incorrecta_no_agrega(self):
        import json
        from unittest.mock import patch
        from cuaderno.views import api_confirmar_nota
        self._crear([self.AL1, self.AL2], requierePin=True)
        request = self.factory.post("/api/notas/confirmar/", data=json.dumps(
            {"notaId": str(self._nota()["_id"]), "pin": "0000"}),
            content_type="application/json")
        request.session = {"usuario_gmail": self.AL1}
        with patch("cuaderno.views.verificar_pin", return_value=False), \
             patch("cuaderno.views.pin_limite_ip", return_value=(True, None)):
            resp = api_confirmar_nota(request)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self._nota()["firmas"], [])

    # --- historial ----------------------------------------------------------

    def _historial(self, gmail=None):
        from cuaderno.views import api_notas_enviadas
        request = self.factory.get("/api/notas/enviadas/")
        request.session = {"usuario_gmail": gmail or self.PRECEPTOR}
        return _json_resp(api_notas_enviadas(request))["notas"]

    def test_historial_dice_cuantos_alumnos(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        self.assertEqual(self._historial()[0]["destino"], f"3 alumnos de {self.CURSO}")
        self.assertEqual(self._historial()[0]["cantidadAlumnos"], 3)

    def test_historial_lista_los_nombres(self):
        self._crear([self.AL1, self.AL2])
        nombres = self._historial()[0]["destinatarios"]
        self.assertIn("Ana Torres", nombres)
        self.assertIn("Belén Sosa", nombres)

    def test_historial_de_una_nota_individual(self):
        self._crear([self.AL1])
        self.assertEqual(self._historial()[0]["destino"], "Ana Torres")

    def test_historial_de_todo_el_curso(self):
        self._crear([self.AL1, self.AL2, self.AL3, self.AL4])
        self.assertEqual(self._historial()[0]["destino"], f"Todo {self.CURSO}")

    def test_historial_una_sola_linea_para_varios(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        self.assertEqual(len(self._historial()), 1)

    def test_historial_desglosa_firmas_del_grupo(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        self._firmar(self._nota()["_id"], self.AL1)
        nota = self._historial()[0]
        self.assertEqual(nota["firmados"], ["Ana Torres"])
        self.assertEqual(nota["sinFirmar"], ["Belén Sosa"])
        self.assertFalse(nota["todosFirmaron"])

    def test_historial_sin_pin_no_desglosa_firmas(self):
        self._crear([self.AL1, self.AL2], requierePin=False)
        nota = self._historial()[0]
        self.assertEqual(nota["sinFirmar"], [])
        # El alcance se sigue informed aunque no haya PIN.
        self.assertEqual(nota["cantidadAlumnos"], 2)

    # --- edición del texto --------------------------------------------------

    def _editar(self, nota_id, gmail, **extra):
        import json
        from cuaderno.views import api_editar_nota
        body = {"id": str(nota_id), "titulo": "Titulo corregido",
                "contenido": "Contenido corregido"}
        body.update(extra)
        request = self.factory.post("/api/notas/editar/", data=json.dumps(body),
                                    content_type="application/json")
        request.session = {"usuario_gmail": gmail}
        return api_editar_nota(request)

    def test_autor_eda_la_nota_a_varios_una_sola_vez(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        resp = self._editar(self._nota()["_id"], self.PRECEPTOR)
        self.assertEqual(resp.status_code, 200)
        nota = self._nota()
        self.assertEqual(nota["Titulo"], "Titulo corregido")
        self.assertEqual(nota["Contenido"], "Contenido corregido")
        self.assertTrue(nota["editada"])
        self.assertEqual(nota["AutorGmail"], self.PRECEPTOR)

    def test_los_demas_ven_la_version_corregida(self):
        self._crear([self.AL1, self.AL2])
        self._editar(self._nota()["_id"], self.PRECEPTOR)
        for gmail in (self.AL1, self.AL2):
            notas = [n for n in self._notas_de(gmail) if n["titulo"] == "Titulo corregido"]
            self.assertEqual(len(notas), 1, f"{gmail} debe ver la corrección")

    def test_otro_docente_no_eda_la_nota(self):
        self._crear([self.AL1, self.AL2])
        resp = self._editar(self._nota()["_id"], "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._nota()["Titulo"], "Titulo")

    def test_alumno_no_eda_la_nota(self):
        self._crear([self.AL1, self.AL2])
        self.assertEqual(self._editar(self._nota()["_id"], self.AL1).status_code, 403)

    def test_no_se_eda_si_alguien_ya_firmo(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        self._firmar(self._nota()["_id"], self.AL1)
        resp = self._editar(self._nota()["_id"], self.PRECEPTOR)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("firmada", _json_resp(resp)["error"])
        self.assertEqual(self._nota()["Titulo"], "Titulo")

    def test_se_eda_mientras_nadie_firmo(self):
        self._crear([self.AL1, self.AL2], requierePin=True)
        self.assertEqual(self._editar(self._nota()["_id"], self.PRECEPTOR).status_code, 200)

    def test_no_se_eda_una_nota_en_papelera(self):
        self._crear([self.AL1, self.AL2])
        self._db["notas"].update_one({"_id": self._nota()["_id"]}, {"$set": {"eliminada": True}})
        self.assertEqual(self._editar(self._nota()["_id"], self.PRECEPTOR).status_code, 400)

    def test_editar_sin_id_400(self):
        self.assertEqual(self._editar("x" * 24, self.PRECEPTOR, id="").status_code, 400)

    def test_editar_con_texto_vacio_400(self):
        self._crear([self.AL1, self.AL2])
        resp = self._editar(self._nota()["_id"], self.PRECEPTOR, titulo="   ")
        self.assertEqual(resp.status_code, 400)

    def test_editar_texto_muy_largo_400(self):
        self._crear([self.AL1, self.AL2])
        resp = self._editar(self._nota()["_id"], self.PRECEPTOR, contenido="x" * 5001)
        self.assertEqual(resp.status_code, 400)

    def test_editar_nota_inexistente_404(self):
        resp = self._editar("64b000000000000000000009", self.PRECEPTOR)
        self.assertEqual(resp.status_code, 404)

    def test_editar_sin_sesion_401(self):
        self._crear([self.AL1, self.AL2])
        self.assertEqual(self._editar(self._nota()["_id"], None).status_code, 401)

    def test_editar_no_toca_los_destinatarios(self):
        self._crear([self.AL1, self.AL2, self.AL3])
        self._editar(self._nota()["_id"], self.PRECEPTOR)
        self.assertEqual(self._nota()["alumnos"], [self.AL1, self.AL2, self.AL3])

    # --- orden de alumnos ---------------------------------------------------

    def test_orden_sin_acentos(self):
        from cuaderno.views import _alumnos_activos
        nombres = [n for _, n in _alumnos_activos(self.CURSO)]
        # Ana, Belén, Carla, Diego: Méndez tiene tilde pero cae donde debe.
        self.assertEqual(nombres[0], "Ana Torres")
        self.assertEqual(nombres[-1], "Diego Ponce")

    def test_no_incluye_alumnos_dados_de_baja(self):
        from cuaderno.views import _alumnos_activos
        self._db["usuarios"].update_one({"Gmail": self.AL4}, {"$set": {"estado": "Baja"}})
        gmails = [g for g, _ in _alumnos_activos(self.CURSO)]
        self.assertNotIn(self.AL4, gmails)

    def test_no_incluye_docentes(self):
        from cuaderno.views import _alumnos_activos
        gmails = [g for g, _ in _alumnos_activos(self.CURSO)]
        self.assertNotIn(self.PRECEPTOR, gmails)


class TestApiCrearNota(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_views = cuaderno.views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.views, "_mongo_db", self._orig_views)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _post(self, data_dict, gmail=None):
        import json
        from cuaderno.views import api_crear_nota
        request = self.factory.post(
            "/api/notas/crear/",
            data=json.dumps(data_dict),
            content_type="application/json",
        )
        if gmail:
            request.session = {"usuario_gmail": gmail}
        else:
            request.session = {}
        return api_crear_nota(request)

    def test_profesor_envia_nota_a_su_curso(self):
        resp = self._post({
            "curso": "4B", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(_json_resp(resp)["ok"])

    def test_profesor_no_puede_enviar_nota_a_otro_curso(self):
        resp = self._post({
            "curso": "4A", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_profesor_no_puede_enviar_nota_a_alumno_de_otro_curso(self):
        resp = self._post({
            "curso": "4B", "destinatario": "alumno1.4a@insi.edu.ar",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "prof.4b@insi.edu.ar")
        self.assertIn(resp.status_code, (400, 403))

    def test_preceptor_envia_nota_a_su_curso(self):
        resp = self._post({
            "curso": "4A", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_mixto_envia_nota_como_profesor(self):
        resp = self._post({
            "curso": "4B", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "mixto@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_mixto_envia_nota_como_preceptor(self):
        resp = self._post({
            "curso": "5A", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "mixto@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)

    def test_rol_del_servidor_no_del_cliente(self):
        import json
        from cuaderno.views import api_crear_nota
        request = self.factory.post(
            "/api/notas/crear/",
            data=json.dumps({
                "curso": "4B", "destinatario": "curso",
                "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
                "autorRol": "Admin",
            }),
            content_type="application/json",
        )
        request.session = {"usuario_gmail": "prof.4b@insi.edu.ar"}
        resp = api_crear_nota(request)
        self.assertEqual(resp.status_code, 200)
        nota = self._db["notas"]._docs[-1]
        self.assertIn("Profesor", nota["AutorRol"])
        self.assertNotIn("Admin", nota["AutorRol"])


# ---------------------------------------------------------------------------
# Tests: Asistencia (asistencia_views)
# ---------------------------------------------------------------------------

class TestAsistencia(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.asistencia_views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_av = cuaderno.asistencia_views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.asistencia_views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.asistencia_views, "_mongo_db", self._orig_av)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _get(self, params, gmail):
        from cuaderno.asistencia_views import api_asistencia_preceptor
        request = self.factory.get("/api/asistencia/preceptor/", params)
        request.session = {"usuario_gmail": gmail}
        return api_asistencia_preceptor(request)

    def _get_profesor(self, params, gmail):
        from cuaderno.asistencia_views import api_asistencia_profesor
        request = self.factory.get("/api/asistencia/profesor/", params)
        request.session = {"usuario_gmail": gmail}
        return api_asistencia_profesor(request)

    def test_preceptor_accede_institucional_a_su_curso(self):
        resp = self._get(
            {"curso": "4A", "fecha": "2026-08-15", "tipo": "institucional", "turno": "mañana"},
            "prec.4a@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)

    def test_preceptor_no_accede_institucional_otro_curso(self):
        resp = self._get(
            {"curso": "4B", "fecha": "2026-08-15", "tipo": "institucional", "turno": "mañana"},
            "prec.4a@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 403)

    def test_profesor_accede_materia_a_su_curso(self):
        resp = self._get_profesor(
            {"curso": "4B", "materia": "Educación Física", "fecha": "2026-08-15"},
            "prof.4b@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)

    def test_profesor_no_accede_institucional(self):
        resp = self._get(
            {"curso": "4B", "fecha": "2026-08-15", "tipo": "institucional", "turno": "mañana"},
            "prof.4b@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 403)

    def test_mixto_profesor_accede_materia_4b(self):
        resp = self._get_profesor(
            {"curso": "4B", "materia": "Química", "fecha": "2026-08-15"},
            "mixto@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)

    def test_mixto_preceptor_accede_institucional_5a(self):
        resp = self._get(
            {"curso": "5A", "fecha": "2026-08-15", "tipo": "institucional", "turno": "mañana"},
            "mixto@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)


# ---------------------------------------------------------------------------
# Tests: get_asignaciones con _id
# ---------------------------------------------------------------------------

class TestGetAsignacionesConId(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_get_asignaciones_devuelve_ids(self):
        from cuaderno.auth import get_asignaciones
        resultado = get_asignaciones(ObjectId("64b000000000000000000006"))
        self.assertEqual(len(resultado), 2)
        ids = {a["_id"] for a in resultado}
        self.assertIn("64c000000000000000000001", ids)
        self.assertIn("64c000000000000000000002", ids)

    def test_get_asignaciones_profesor_incluye_materia(self):
        from cuaderno.auth import get_asignaciones
        resultado = get_asignaciones(ObjectId("64b000000000000000000006"))
        prof = [a for a in resultado if a["materia"] == "Educación Física"]
        self.assertEqual(len(prof), 1)
        self.assertEqual(prof[0]["curso"], "6B")

    def test_get_asignaciones_preceptor_materia_null(self):
        from cuaderno.auth import get_asignaciones
        resultado = get_asignaciones(ObjectId("64b000000000000000000006"))
        prec = [a for a in resultado if a["materia"] is None]
        self.assertEqual(len(prec), 1)
        self.assertEqual(prec[0]["curso"], "6B")


# ---------------------------------------------------------------------------
# Tests: puede_acceder_asignacion
# ---------------------------------------------------------------------------

class TestPuedeAccederAsignacion(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        self._orig = cuaderno.auth._mongo_db
        cuaderno.auth._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig)

    def test_dual_accede_a_su_asignacion_profesor(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("dual@insi.edu.ar", "64c000000000000000000001")
        self.assertTrue(ok)
        self.assertEqual(info["curso"], "6B")
        self.assertEqual(info["materia"], "Educación Física")

    def test_dual_accede_a_su_asignacion_preceptor(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("dual@insi.edu.ar", "64c000000000000000000002")
        self.assertTrue(ok)
        self.assertEqual(info["curso"], "6B")
        self.assertIsNone(info["materia"])

    def test_profesor_no_accede_a_asignacion_de_otro(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("prof.4b@insi.edu.ar", "64c000000000000000000001")
        self.assertFalse(ok)
        self.assertIsNone(info)

    def test_preceptor_no_accede_a_asignacion_de_otro(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("prec.4a@insi.edu.ar", "64c000000000000000000002")
        self.assertFalse(ok)
        self.assertIsNone(info)

    def test_admin_no_accede_a_asignacion_especifica(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("admin@insi.edu.ar", "64c000000000000000000001")
        self.assertFalse(ok)

    def test_id_invalido_devuelve_false(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("dual@insi.edu.ar", "no_es_un_id")
        self.assertFalse(ok)
        self.assertIsNone(info)

    def test_id_vacio_devuelve_false(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok, info = puede_acceder_asignacion("dual@insi.edu.ar", "")
        self.assertFalse(ok)


# ---------------------------------------------------------------------------
# Tests: GET /api/alumnos/ con parámetro asignacion
# ---------------------------------------------------------------------------

class TestApiAlumnosPorCursoAsignacion(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_views = cuaderno.views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.views, "_mongo_db", self._orig_views)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _get(self, params, gmail):
        from cuaderno.views import api_alumnos_por_curso
        request = self.factory.get("/api/alumnos/", params)
        request.session = {"usuario_gmail": gmail}
        return api_alumnos_por_curso(request)

    def test_dual_con_asignacion_profesor_obtiene_alumnos_6b(self):
        resp = self._get(
            {"curso": "6B", "asignacion": "64c000000000000000000001"},
            "dual@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)
        gmails = {a["gmail"] for a in _json_resp(resp)["alumnos"]}
        self.assertIn("alumno1.6b@insi.edu.ar", gmails)
        self.assertIn("alumno2.6b@insi.edu.ar", gmails)

    def test_dual_con_asignacion_preceptor_obtiene_alumnos_6b(self):
        resp = self._get(
            {"curso": "6B", "asignacion": "64c000000000000000000002"},
            "dual@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 200)
        gmails = {a["gmail"] for a in _json_resp(resp)["alumnos"]}
        self.assertIn("alumno1.6b@insi.edu.ar", gmails)

    def test_profesor_intenta_usar_asignacion_de_dual(self):
        resp = self._get(
            {"curso": "6B", "asignacion": "64c000000000000000000001"},
            "prof.4b@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 403)

    def test_dual_con_asignacion_curso_no_coincide(self):
        resp = self._get(
            {"curso": "4A", "asignacion": "64c000000000000000000001"},
            "dual@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 403)

    def test_asignacion_id_invalido_403(self):
        resp = self._get(
            {"curso": "6B", "asignacion": "no_existe"},
            "dual@insi.edu.ar",
        )
        self.assertEqual(resp.status_code, 403)

    def test_sin_asignacion_cae_back_a_puede_acceder_alumnos_curso(self):
        resp = self._get({"curso": "6B"}, "dual@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)


# ---------------------------------------------------------------------------
# Tests: POST /api/notas/crear/ con asignacionId
# ---------------------------------------------------------------------------

class TestApiCrearNotaConAsignacion(unittest.TestCase):

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_views = cuaderno.views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.views, "_mongo_db", self._orig_views)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def _post(self, data_dict, gmail):
        import json
        from cuaderno.views import api_crear_nota
        request = self.factory.post(
            "/api/notas/crear/",
            data=json.dumps(data_dict),
            content_type="application/json",
        )
        request.session = {"usuario_gmail": gmail}
        return api_crear_nota(request)

    def test_dual_envia_nota_con_asignacion_profesor(self):
        resp = self._post({
            "curso": "6B", "asignacionId": "64c000000000000000000001",
            "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "dual@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        nota = self._db["notas"]._docs[-1]
        self.assertEqual(nota["AsignacionId"], "64c000000000000000000001")
        self.assertEqual(nota["AsignacionMateria"], "Educación Física")

    def test_dual_envia_nota_con_asignacion_preceptor(self):
        resp = self._post({
            "curso": "6B", "asignacionId": "64c000000000000000000002",
            "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "dual@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        nota = self._db["notas"]._docs[-1]
        self.assertEqual(nota["AsignacionId"], "64c000000000000000000002")
        self.assertIsNone(nota["AsignacionMateria"])

    def test_profesor_no_puede_usar_asignacion_de_dual(self):
        resp = self._post({
            "curso": "6B", "asignacionId": "64c000000000000000000001",
            "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_dual_con_asignacion_curso_erroneo(self):
        resp = self._post({
            "curso": "4A", "asignacionId": "64c000000000000000000001",
            "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "dual@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_nota_sin_asignacion_id_aun_funciona(self):
        resp = self._post({
            "curso": "6B", "destinatario": "curso",
            "tipo": "comunicado", "titulo": "Test", "contenido": "Contenido",
        }, "dual@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)


# ---------------------------------------------------------------------------
# Tests: El caso exacto — Profesor+Preceptor mismo curso 6B
# ---------------------------------------------------------------------------

class TestDualRoleMismoCurso(unittest.TestCase):
    """Verifica que dual@insi.edu.ar (Profesor 6B Educ Física + Preceptor 6B)
    puede acceder a 6B por ambos roles, pero las asignaciones se distinguen."""

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_views = cuaderno.views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.views, "_mongo_db", self._orig_views)
        from django.test import RequestFactory
        self.factory = RequestFactory()

    def test_ambas_asignaciones_existen_y_son_distintas(self):
        from cuaderno.auth import get_asignaciones
        asignaciones = get_asignaciones(ObjectId("64b000000000000000000006"))
        ids = {a["_id"] for a in asignaciones}
        self.assertEqual(len(ids), 2, "Deben existir 2 asignaciones distintas")

    def test_asignaciones_mismo_curso_diferente_contexto(self):
        from cuaderno.auth import get_asignaciones
        asignaciones = get_asignaciones(ObjectId("64b000000000000000000006"))
        cursos = {a["curso"] for a in asignaciones}
        self.assertEqual(cursos, {"6B"}, "Ambas asignaciones son para 6B")
        materias = {a["materia"] for a in asignaciones}
        self.assertIn("Educación Física", materias)
        self.assertIn(None, materias)

    def test_profesor_y_preceptor_acceden_a_6b(self):
        from cuaderno.auth import puede_acceder_alumnos_curso
        self.assertTrue(puede_acceder_alumnos_curso("dual@insi.edu.ar", "6B"))

    def test_asignaciones_son_identificables_por_id(self):
        from cuaderno.auth import puede_acceder_asignacion
        ok1, info1 = puede_acceder_asignacion("dual@insi.edu.ar", "64c000000000000000000001")
        ok2, info2 = puede_acceder_asignacion("dual@insi.edu.ar", "64c000000000000000000002")
        self.assertTrue(ok1)
        self.assertTrue(ok2)
        self.assertEqual(info1["materia"], "Educación Física")
        self.assertIsNone(info2["materia"])


# ---------------------------------------------------------------------------
# Tests: Actas de asistencia (snapshot + PDF)
# ---------------------------------------------------------------------------

class TestActasAsistencia(unittest.TestCase):
    """El snapshot del acta y su descarga en PDF."""

    ANIO = "2026"
    FECHA = "2026-09-28"

    def setUp(self):
        self._db = _make_db()
        self._db["config"].insert_one({
            "_id": "config",
            "anio_lectivo": self.ANIO,
            "nombre_escuela": "Instituto Test",
        })
        import cuaderno.auth
        import cuaderno.actas
        import cuaderno.asistencia_views
        # Los tres módulos comparten la misma base: hay que parchear los tres.
        for modulo in (cuaderno.auth, cuaderno.actas, cuaderno.asistencia_views):
            self.addCleanup(setattr, modulo, "_mongo_db", modulo._mongo_db)
            modulo._mongo_db = self._db
        from django.test import RequestFactory
        self.factory = RequestFactory()

    # --- helpers de request ------------------------------------------------

    def _post(self, vista, ruta, payload, gmail):
        import json
        request = self.factory.post(ruta, data=json.dumps(payload), content_type="application/json")
        request.session = {"usuario_gmail": gmail}
        return vista(request)

    def _get(self, vista, ruta, params, gmail):
        request = self.factory.get(ruta, params)
        request.session = {"usuario_gmail": gmail}
        return vista(request)

    def _guardar_institucional(self, registros, gmail="prec.4a@insi.edu.ar"):
        from cuaderno.asistencia_views import api_asistencia_preceptor_guardar
        return self._post(
            api_asistencia_preceptor_guardar, "/api/asistencia/preceptor/guardar/",
            {"curso": "4A", "fecha": self.FECHA, "tipo": "institucional",
             "turno": "mañana", "registros": registros},
            gmail,
        )

    def _guardar_materia(self, registros, gmail="prof.4b@insi.edu.ar"):
        from cuaderno.asistencia_views import api_asistencia_profesor_guardar
        return self._post(
            api_asistencia_profesor_guardar, "/api/asistencia/profesor/guardar/",
            {"curso": "4B", "fecha": self.FECHA, "materia": "Educación Física",
             "registros": registros},
            gmail,
        )

    def _actas(self):
        return self._db["asistencia_actas"]._docs

    # --- regresión: guardar por materia devolvía 500 ------------------------

    def test_guardar_materia_devuelve_200(self):
        resp = self._guardar_materia([
            {"gmail": "alumno1.4b@insi.edu.ar", "estado": "Presente"},
        ])
        self.assertEqual(resp.status_code, 200)
        data = _json_resp(resp)
        self.assertTrue(data["ok"])
        self.assertEqual(data["cambios"], 1)

    def test_guardar_materia_no_crea_acta_inexistente(self):
        self._guardar_materia([{"gmail": "alumno1.4b@insi.edu.ar", "estado": "Presente"}])
        self.assertEqual(len(self._actas()), 1)

    def test_guardar_materia_de_curso_no_asignado_403(self):
        resp = self._guardar_materia(
            [{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}],
            gmail="prec.4a@insi.edu.ar",
        )
        # 4A no tiene al profesor, y 4B tampoco es curso del preceptor.
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._actas(), [])

    # --- _filtro_materia ahora incluye anio_lectivo -------------------------

    def test_filtro_materia_incluye_anio_lectivo(self):
        from cuaderno.asistencia_views import _filtro_materia
        filtro = _filtro_materia("4B", self.FECHA, "Educación Física", self.ANIO)
        self.assertEqual(filtro["anio_lectivo"], self.ANIO)
        self.assertEqual(filtro["curso"], "4B")
        self.assertEqual(filtro["tipo"], "materia")

    def test_filtro_materia_sin_anio_no_lo_agrega(self):
        from cuaderno.asistencia_views import _filtro_materia
        self.assertNotIn("anio_lectivo", _filtro_materia("4B", self.FECHA, "Mat"))

    def test_acta_materia_queda_filtrada_por_anio(self):
        from cuaderno.actas import obtener_acta
        from cuaderno.asistencia_views import _filtro_materia
        self._guardar_materia([{"gmail": "alumno1.4b@insi.edu.ar", "estado": "Presente"}])
        clave = self._actas()[0]["clave"]
        doc = obtener_acta(clave)
        # El mismo filtro con el año correcto tiene que encontrar el registro.
        filtro = _filtro_materia("4B", self.FECHA, "Educación Física", self.ANIO)
        encontrados = self._db["asistencias"].find(filtro)
        self.assertEqual(len(encontrados), 1)
        self.assertEqual(encontrados[0]["anio_lectivo"], self.ANIO)
        self.assertEqual(doc["anio_lectivo"], self.ANIO)

    # --- contenido del snapshot --------------------------------------------

    def test_acta_incluye_todos_los_alumnos_del_curso(self):
        self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"},
        ])
        registros = self._actas()[0]["registros"]
        # 4A tiene un solo alumno activo; el de baja no entra.
        self.assertEqual(len(registros), 1)
        self.assertEqual(registros[0]["gmail"], "alumno1.4a@insi.edu.ar")
        self.assertEqual(registros[0]["estado"], "Presente")

    def test_acta_incluye_alumnos_sin_marcar(self):
        self._db["usuarios"].insert_one({
            "Gmail": "alumno2.4a@insi.edu.ar", "Nombres": "Belén", "Apellido": "Sosa",
            "Curso": "4A", "Rol": "Alumno", "estado": "Activo",
        })
        self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"},
            {"gmail": "alumno2.4a@insi.edu.ar", "estado": None},
        ])
        registros = self._actas()[0]["registros"]
        estados = {r["gmail"]: r["estado"] for r in registros}
        self.assertEqual(estados["alumno1.4a@insi.edu.ar"], "Presente")
        self.assertIsNone(estados["alumno2.4a@insi.edu.ar"])

    def test_acta_refleja_lo_persistido_no_el_payload(self):
        # El segundo alumno no pertenece al curso: se descarta al guardar,
        # y aun así no debe aparecer en el acta.
        resp = self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"},
            {"gmail": "alumno1.4b@insi.edu.ar", "estado": "Ausente"},
        ])
        self.assertEqual(_json_resp(resp)["cambios"], 1)
        registros = self._actas()[0]["registros"]
        self.assertEqual([r["gmail"] for r in registros], ["alumno1.4a@insi.edu.ar"])

    def test_acta_ignora_estado_invalido(self):
        self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "NoExiste"},
        ])
        self.assertIsNone(self._actas()[0]["registros"][0]["estado"])

    def test_resumen_del_acta(self):
        self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"},
        ])
        resumen = self._actas()[0]["resumen"]
        self.assertEqual(resumen["total"], 1)
        self.assertEqual(resumen["ausentes"], 1)
        self.assertEqual(resumen["inasistencias"], 1)

    def test_acta_ordenada_por_apellido(self):
        self._db["usuarios"].insert_one({
            "Gmail": "alumno9.4a@insi.edu.ar", "Nombres": "Zulema",
            "Apellido": "Álvarez", "Curso": "4A", "Rol": "Alumno", "estado": "Activo",
        })
        self._guardar_institucional([
            {"gmail": "alumno9.4a@insi.edu.ar", "estado": "Presente"},
        ])
        apellidos = [r["apellido"] for r in self._actas()[0]["registros"]]
        self.assertEqual(apellidos, ["Álvarez", "Torres"])

    def test_acta_no_incluye_alumno_de_baja(self):
        self._db["usuarios"].insert_one({
            "Gmail": "baja.4a@insi.edu.ar", "Nombres": "Fuera", "Apellido": "Zeta",
            "Curso": "4A", "Rol": "Alumno", "estado": "Baja",
        })
        self._guardar_institucional([])
        self.assertEqual([r["gmail"] for r in self._actas()[0]["registros"]],
                         ["alumno1.4a@insi.edu.ar"])

    # --- versiones y trazabilidad -------------------------------------------

    def test_acta_nueva_empieza_en_version_1(self):
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}])
        self.assertEqual(self._actas()[0]["version"], 1)
        self.assertEqual(len(self._actas()[0]["revisiones"]), 1)

    def test_reguardar_incrementa_version_y_conserva_creacion(self):
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}])
        creado = self._actas()[0]["creado"]
        generado_por = self._actas()[0]["generadoPor"]
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(len(self._actas()), 1, "No debe crear un acta nueva")
        acta = self._actas()[0]
        self.assertEqual(acta["version"], 2)
        self.assertEqual(acta["creado"], creado)
        self.assertEqual(acta["generadoPor"], generado_por)
        self.assertEqual(len(acta["revisiones"]), 2)
        self.assertEqual(acta["registros"][0]["estado"], "Ausente")

    def test_actas_distintas_por_turno(self):
        from cuaderno.asistencia_views import api_asistencia_preceptor_guardar
        self._guardar_institucional([])
        self._post(api_asistencia_preceptor_guardar, "/api/asistencia/preceptor/guardar/",
                   {"curso": "4A", "fecha": self.FECHA, "tipo": "institucional",
                    "turno": "tarde", "registros": []}, "prec.4a@insi.edu.ar")
        self.assertEqual(len(self._actas()), 2)
        self.assertEqual({a["turno"] for a in self._actas()}, {"mañana", "tarde"})

    def test_actas_distintas_por_materia(self):
        from cuaderno.asistencia_views import api_asistencia_preceptor_guardar
        self._guardar_materia([{"gmail": "alumno1.4b@insi.edu.ar", "estado": "Presente"}])
        self._post(api_asistencia_preceptor_guardar, "/api/asistencia/preceptor/guardar/",
                   {"curso": "4B", "fecha": self.FECHA, "tipo": "materia",
                    "materia": "Matemática", "registros": []}, "admin@insi.edu.ar")
        claves = {a["clave"] for a in self._actas()}
        self.assertEqual(len(claves), 2)
        self.assertTrue(any("Educación Física" in c for c in claves))
        self.assertTrue(any("Matemática" in c for c in claves))

    def test_clave_acta_es_estable(self):
        from cuaderno.actas import clave_acta
        self.assertEqual(
            clave_acta("2026", "institucional", "4A", self.FECHA, "mañana", None),
            "2026|institucional|4A|2026-09-28|mañana|",
        )

    def test_indice_unico_creado_una_vez(self):
        import cuaderno.actas
        cuaderno.actas._indice_creado = False
        self.addCleanup(setattr, cuaderno.actas, "_indice_creado", True)
        self._guardar_institucional([])
        self._guardar_institucional([])
        self.assertTrue(cuaderno.actas._indice_creado)
        indices = self._db["asistencia_actas"]._indices
        self.assertEqual(len(indices), 1, "El índice no debe recrearse en cada guardado")
        self.assertEqual(indices[0], (("clave",), {"unique": True}))

    def test_fallo_al_generar_acta_no_rompe_el_guardado(self):
        import cuaderno.asistencia_views as av
        original = av.registrar_acta
        av.registrar_acta = MagicMock(side_effect=RuntimeError("boom"))
        self.addCleanup(setattr, av, "registrar_acta", original)
        resp = self._guardar_institucional([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"},
        ])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(_json_resp(resp)["cambios"], 1)

    # --- listado ------------------------------------------------------------

    def _listar(self, params, gmail):
        from cuaderno.asistencia_views import api_actas_lista
        return self._get(api_actas_lista, "/api/asistencia/actas/", params, gmail)

    def test_lista_actas_de_preceptor(self):
        self._guardar_institucional([])
        resp = self._listar({}, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        data = _json_resp(resp)
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["actas"][0]["curso"], "4A")

    def test_lista_actas_no_expone_registros_internos(self):
        self._guardar_institucional([])
        acta = _json_resp(self._listar({}, "prec.4a@insi.edu.ar"))["actas"][0]
        self.assertNotIn("registros", acta)
        self.assertIn("resumen", acta)

    def test_preceptor_no_ve_actas_de_otro_curso(self):
        self._guardar_institucional([])
        resp = self._listar({}, "prec.vacio@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 0)

    def test_profesor_no_ve_acta_institucional(self):
        self._guardar_institucional([], gmail="admin@insi.edu.ar")
        resp = self._listar({}, "prof.4b@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 0)

    def test_profesor_ve_su_acta_de_materia(self):
        self._guardar_materia([])
        resp = self._listar({}, "prof.4b@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 1)
        self.assertEqual(_json_resp(resp)["actas"][0]["materia"], "Educación Física")

    def test_profesor_no_ve_materia_que_no_da(self):
        self._guardar_materia([])  # Educación Física 4B
        resp = self._listar({"materia": "Química"}, "prof.4b@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 0)

    def test_admin_ve_actas_de_cualquier_curso(self):
        self._guardar_institucional([], gmail="admin@insi.edu.ar")
        self._guardar_materia([], gmail="admin@insi.edu.ar")
        self.assertEqual(_json_resp(self._listar({}, "admin@insi.edu.ar"))["total"], 2)

    def test_alumno_no_accede_al_listado(self):
        resp = self._listar({}, "alumno1.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 403)

    def test_lista_sin_autenticacion_401(self):
        resp = self._listar({}, None)
        self.assertEqual(resp.status_code, 401)

    def test_lista_ordena_por_fecha_descendente(self):
        self._db["asistencia_actas"].insert_one({
            "clave": "2026|institucional|4A|2026-09-01|mañana|", "curso": "4A",
            "tipo": "institucional", "fecha": "2026-09-01", "turno": "mañana",
            "anio_lectivo": "2026", "registros": [], "resumen": {},
        })
        self._guardar_institucional([])
        actas = _json_resp(self._listar({}, "prec.4a@insi.edu.ar"))["actas"]
        self.assertEqual([a["fecha"] for a in actas], [self.FECHA, "2026-09-01"])

    def test_lista_filtra_por_curso(self):
        self._guardar_institucional([])
        self._guardar_materia([], gmail="admin@insi.edu.ar")
        resp = self._listar({"curso": "4A"}, "admin@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 1)

    def test_lista_filtra_por_tipo(self):
        self._guardar_institucional([])
        self._guardar_materia([], gmail="admin@insi.edu.ar")
        resp = self._listar({"tipo": "materia"}, "admin@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 1)
        self.assertEqual(_json_resp(resp)["actas"][0]["tipo"], "materia")

    def test_lista_filtra_por_rango_de_fechas(self):
        self._db["asistencia_actas"].insert_one({
            "clave": "2026|institucional|4A|2026-09-01|mañana|", "curso": "4A",
            "tipo": "institucional", "fecha": "2026-09-01", "turno": "mañana",
            "anio_lectivo": "2026", "registros": [], "resumen": {},
        })
        self._guardar_institucional([])
        resp = self._listar({"desde": "2026-09-20"}, "prec.4a@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 1)
        self.assertEqual(_json_resp(resp)["actas"][0]["fecha"], self.FECHA)

    def test_lista_respeta_limite(self):
        self._guardar_institucional([])
        resp = self._listar({"limite": "0"}, "prec.4a@insi.edu.ar")
        self.assertEqual(_json_resp(resp)["total"], 1)  # se clampa al mínimo
        self.assertEqual(_json_resp(self._listar({"limite": "abc"}, "prec.4a@insi.edu.ar"))["total"], 1)

    # --- detalle ------------------------------------------------------------

    def _detalle(self, clave, gmail):
        from cuaderno.asistencia_views import api_actas_detalle
        return self._get(api_actas_detalle, "/api/asistencia/actas/detalle/",
                         {"clave": clave}, gmail)

    def test_detalle_devuelve_registros(self):
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        clave = self._actas()[0]["clave"]
        resp = self._detalle(clave, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        acta = _json_resp(resp)["acta"]
        self.assertEqual(len(acta["registros"]), 1)
        self.assertEqual(acta["registros"][0]["estado"], "Ausente")
        self.assertNotIn("_id", acta)

    def test_detalle_de_acta_inexistente_404(self):
        resp = self._detalle("no|existe|clave", "admin@insi.edu.ar")
        self.assertEqual(resp.status_code, 404)

    def test_detalle_sin_clave_400(self):
        self.assertEqual(self._detalle("", "admin@insi.edu.ar").status_code, 400)

    def test_detalle_no_autorizado_404(self):
        # 404 y no 403: si se distinguiera "no existe" de "no te toca", un
        # docente podría enumerar en qué cursos se archivaron listas.
        self._guardar_institucional([])
        clave = self._actas()[0]["clave"]
        self.assertEqual(self._detalle(clave, "prec.vacio@insi.edu.ar").status_code, 404)

    def test_detalle_alumno_403(self):
        self._guardar_institucional([])
        clave = self._actas()[0]["clave"]
        self.assertEqual(self._detalle(clave, "alumno1.4a@insi.edu.ar").status_code, 403)

    def test_detalle_sin_autenticacion_401(self):
        self._guardar_institucional([])
        clave = self._actas()[0]["clave"]
        self.assertEqual(self._detalle(clave, None).status_code, 401)

    # --- PDF ----------------------------------------------------------------

    def _pdf(self, clave, gmail):
        from cuaderno.asistencia_views import api_actas_pdf
        return self._get(api_actas_pdf, "/api/asistencia/actas/pdf/", {"clave": clave}, gmail)

    def test_pdf_es_un_pdf_valido(self):
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        clave = self._actas()[0]["clave"]
        resp = self._pdf(clave, "prec.4a@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertEqual(resp.content[:5], b"%PDF-")
        self.assertGreater(len(resp.content), 1000)

    def test_pdf_nombre_de_archivo_legible(self):
        from cuaderno.pdf_acta import nombre_archivo
        self._guardar_institucional([])
        nombre = nombre_archivo(self._actas()[0])
        self.assertTrue(nombre.endswith(".pdf"))
        self.assertIn("4A", nombre)
        self.assertIn(self.FECHA, nombre)
        self.assertIn("mañana", nombre)

    def test_pdf_content_disposition_con_utf8(self):
        from cuaderno.pdf_acta import content_disposition, nombre_archivo
        self._guardar_institucional([])
        cabecera = content_disposition(nombre_archivo(self._actas()[0]))
        self.assertIn("attachment;", cabecera)
        self.assertIn("filename*=UTF-8''", cabecera)
        # El fallback ASCII no debe romper el header.
        ascii_part = cabecera.split("filename=\"")[1].split("\"")[0]
        ascii_part.encode("ascii")  # no debe lanzar
        self.assertIn("2026-09-28", ascii_part)

    def test_pdf_no_cacheable(self):
        self._guardar_institucional([])
        resp = self._pdf(self._actas()[0]["clave"], "prec.4a@insi.edu.ar")
        self.assertEqual(resp["Cache-Control"], "no-store")

    def test_pdf_por_materia(self):
        self._guardar_materia([{"gmail": "alumno1.4b@insi.edu.ar", "estado": "Tarde"}])
        resp = self._pdf(self._actas()[0]["clave"], "prof.4b@insi.edu.ar")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content[:5], b"%PDF-")

    def test_pdf_de_acta_inexistente_404(self):
        self.assertEqual(self._pdf("no|existe", "admin@insi.edu.ar").status_code, 404)

    def test_pdf_sin_clave_400(self):
        self.assertEqual(self._pdf("", "admin@insi.edu.ar").status_code, 400)

    def test_pdf_no_autorizado_404(self):
        # 404 y no 403, igual que el detalle: no se revela la existencia.
        self._guardar_institucional([])
        self.assertEqual(self._pdf(self._actas()[0]["clave"], "prof.4b@insi.edu.ar").status_code, 404)

    def test_pdf_sin_autenticacion_401(self):
        self._guardar_institucional([])
        self.assertEqual(self._pdf(self._actas()[0]["clave"], None).status_code, 401)

    def test_pdf_registra_la_descarga(self):
        self._guardar_institucional([])
        self._pdf(self._actas()[0]["clave"], "prec.4a@insi.edu.ar")
        acciones = [a.get("Accion", "") for a in self._db["auditoria"]._docs]
        self.assertTrue(any("PDF" in a for a in acciones), acciones)

    def test_pdf_refleja_correccion_posterior_del_acta(self):
        # El PDF sale del acta congelada: si se corrige, el acta cambia y con ella el PDF.
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        clave = self._actas()[0]["clave"]
        self.assertEqual(_json_resp(self._detalle(clave, "prec.4a@insi.edu.ar"))["acta"]["registros"][0]["estado"],
                         "Ausente")
        self._guardar_institucional([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}])
        self.assertEqual(_json_resp(self._detalle(clave, "prec.4a@insi.edu.ar"))["acta"]["registros"][0]["estado"],
                         "Presente")
        self.assertEqual(_json_resp(self._detalle(clave, "prec.4a@insi.edu.ar"))["acta"]["version"], 2)


class TestReglasDePermisoDeActas(unittest.TestCase):
    """`_puede_ver_acta` por rol, sin pasar por HTTP."""

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.asistencia_views
        self._orig_auth = cuaderno.auth._mongo_db
        self._orig_av = cuaderno.asistencia_views._mongo_db
        cuaderno.auth._mongo_db = self._db
        cuaderno.asistencia_views._mongo_db = self._db
        self.addCleanup(setattr, cuaderno.auth, "_mongo_db", self._orig_auth)
        self.addCleanup(setattr, cuaderno.asistencia_views, "_mongo_db", self._orig_av)

    def _puede(self, gmail, **acta):
        from cuaderno.asistencia_views import _puede_ver_acta
        return _puede_ver_acta(gmail, acta)

    def test_admin_ve_todo(self):
        self.assertTrue(self._puede("admin@insi.edu.ar", tipo="institucional", curso="4B"))
        self.assertTrue(self._puede("admin@insi.edu.ar", tipo="materia", curso="9Z",
                                    materia="Física"))

    def test_preceptor_ve_su_curso(self):
        self.assertTrue(self._puede("prec.4a@insi.edu.ar", tipo="institucional", curso="4A"))
        self.assertTrue(self._puede("prec.4a@insi.edu.ar", tipo="materia", curso="4A",
                                    materia="Historia"))
        self.assertFalse(self._puede("prec.4a@insi.edu.ar", tipo="institucional", curso="4B"))

    def test_profesor_solo_ve_sus_materias(self):
        self.assertTrue(self._puede("prof.4b@insi.edu.ar", tipo="materia", curso="4B",
                                    materia="Educación Física"))
        self.assertFalse(self._puede("prof.4b@insi.edu.ar", tipo="materia", curso="4B",
                                     materia="Química"))
        self.assertFalse(self._puede("prof.4b@insi.edu.ar", tipo="institucional", curso="4B"))

    def test_alumno_no_ve_ninguna(self):
        self.assertFalse(self._puede("alumno1.4b@insi.edu.ar", tipo="institucional", curso="4B"))
        self.assertFalse(self._puede("alumno1.4b@insi.edu.ar", tipo="materia", curso="4B",
                                     materia="Educación Física"))

    def test_mixto_ve_por_cualquiera_de_sus_roles(self):
        # mixto es profesor de Química en 4B y preceptor de 5A.
        self.assertTrue(self._puede("mixto@insi.edu.ar", tipo="materia", curso="4B",
                                    materia="Química"))
        self.assertTrue(self._puede("mixto@insi.edu.ar", tipo="institucional", curso="5A"))
        self.assertFalse(self._puede("mixto@insi.edu.ar", tipo="institucional", curso="4B"))

    def test_usuario_inexistente_no_ve(self):
        self.assertFalse(self._puede("nadie@insi.edu.ar", tipo="institucional", curso="4A"))


class TestNotificacionesInasistencia(unittest.TestCase):
    """Avisos de inasistencia por correo: encolado, destinatarios y dedupe."""

    ANIO = "2026"
    FECHA = "2026-09-28"

    def setUp(self):
        self._db = _make_db()
        self._db["config"].insert_one({
            "_id": "config",
            "anio_lectivo": self.ANIO,
            "nombre_escuela": "Instituto Test",
            "notificaciones_email": True,
        })
        import cuaderno.auth
        import cuaderno.actas
        import cuaderno.asistencia_views
        import cuaderno.notificaciones
        for modulo in (cuaderno.auth, cuaderno.actas, cuaderno.asistencia_views,
                       cuaderno.notificaciones):
            self.addCleanup(setattr, modulo, "_mongo_db", modulo._mongo_db)
            modulo._mongo_db = self._db
        import cuaderno.notificaciones as notif
        notif._indice_creado = False
        from django.test import RequestFactory
        self.factory = RequestFactory()

    # --- helpers ------------------------------------------------------------

    def _set_email_tutor(self, gmail, email):
        self._db["usuarios"].update_one({"Gmail": gmail}, {"$set": {"EmailTutor": email}})

    def _toggle(self, activo):
        self._db["config"].update_one({"_id": "config"},
                                      {"$set": {"notificaciones_email": activo}})

    def _guardar(self, registros, gmail="prec.4a@insi.edu.ar", tipo="institucional"):
        from cuaderno.asistencia_views import api_asistencia_preceptor_guardar
        import json
        body = {"curso": "4A", "fecha": self.FECHA, "tipo": tipo, "registros": registros}
        if tipo == "institucional":
            body["turno"] = "mañana"
        else:
            body["materia"] = "Historia"
        request = self.factory.post("/api/asistencia/preceptor/guardar/",
                                    data=json.dumps(body), content_type="application/json")
        request.session = {"usuario_gmail": gmail}
        return api_asistencia_preceptor_guardar(request)

    def _cola(self):
        return self._db["notificaciones"]._docs

    def _para(self):
        return sorted(a["para"] for a in self._cola())

    # --- interruptor maestro ------------------------------------------------

    def test_toggle_apagado_no_encola(self):
        self._toggle(False)
        resp = self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(_json_resp(resp)["notificaciones"], 0)
        self.assertEqual(self._cola(), [])

    def test_toggle_prendido_encola(self):
        self._toggle(True)
        resp = self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(_json_resp(resp)["notificaciones"], 1)

    def test_presente_no_notifica(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}])
        self.assertEqual(self._cola(), [])

    def test_tarde_notifica(self):
        resp = self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Tarde",
                               "minutosRetraso": 10}])
        self.assertEqual(_json_resp(resp)["notificaciones"], 1)

    # --- los dos destinatarios ----------------------------------------------

    def test_sin_email_tutor_solo_manda_al_alumno(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(self._para(), ["alumno1.4a@insi.edu.ar"])

    def test_con_email_tutor_manda_a_los_dos(self):
        self._set_email_tutor("alumno1.4a@insi.edu.ar", "Tutor@Ejemplo.COM")
        resp = self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(_json_resp(resp)["notificaciones"], 2)
        self.assertEqual(self._para(), ["alumno1.4a@insi.edu.ar", "tutor@ejemplo.com"])

    def test_no_es_fallback_el_correo_del_alumno(self):
        # Con tutor cargado NO se duplica el correo del alumno.
        self._set_email_tutor("alumno1.4a@insi.edu.ar", "tutor@ejemplo.com")
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        for aviso in self._cola():
            self.assertNotEqual(aviso["para"], "alumno1.4a@insi.edu.ar" if aviso["esTutor"] else "")

    def test_tutor_ignora_mayusculas(self):
        self._set_email_tutor("alumno1.4a@insi.edu.ar", "  TUTOR@Ejemplo.com  ")
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        tutores = [a["para"] for a in self._cola() if a["esTutor"]]
        self.assertEqual(tutores, ["tutor@ejemplo.com"])

    # --- deduplicación ------------------------------------------------------

    def test_reguardar_el_mismo_estado_no_reenvia(self):
        regs = [{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}]
        self._guardar(regs)
        self._guardar(regs)
        self.assertEqual(len(self._cola()), 1)

    def test_cambiar_de_ausente_a_presente_no_avisa(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"}])
        self.assertEqual(len(self._cola()), 1)

    def test_corregir_y_volver_a_ausente_no_reavisa(self):
        # Marcar por error "Presente" y corregir de nuevo a "Ausente" no debe
        # generar un segundo correo: la familia ya fue avisada de ese día.
        g = "alumno1.4a@insi.edu.ar"
        self._guardar([{"gmail": g, "estado": "Ausente"}])
        self._guardar([{"gmail": g, "estado": "Presente"}])
        resp = self._guardar([{"gmail": g, "estado": "Ausente"}])
        self.assertEqual(_json_resp(resp)["notificaciones"], 0)
        self.assertEqual(len(self._cola()), 1)

    def test_tarde_y_ausente_son_claves_distintas(self):
        g = "alumno1.4a@insi.edu.ar"
        self._guardar([{"gmail": g, "estado": "Tarde", "minutosRetraso": 5}])
        self._guardar([{"gmail": g, "estado": "Ausente"}])
        self.assertEqual(len(self._cola()), 2)

    def test_indice_unico_sobre_clave(self):
        import cuaderno.notificaciones as notif
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        indices = self._db["notificaciones"]._indices
        self.assertEqual(indices[0], (("clave",), {"unique": True}))

    # --- contenido del aviso ------------------------------------------------

    def test_aviso_incluye_datos_de_la_clase(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente",
                        "observacion": "No avisó"}])
        aviso = self._cola()[0]
        self.assertIn("4A", aviso["cuerpo"])
        self.assertIn(self.FECHA, aviso["cuerpo"])
        self.assertIn("Ausente", aviso["cuerpo"])
        self.assertIn("No avisó", aviso["cuerpo"])
        self.assertEqual(aviso["curso"], "4A")
        self.assertEqual(aviso["estado"], "Ausente")
        self.assertEqual(aviso["alumno"], "alumno1.4a@insi.edu.ar")

    def test_aviso_al_alumno_dice_hola_por_su_nombre(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        aviso = [a for a in self._cola() if not a["esTutor"]][0]
        self.assertIn("Ana Torres", aviso["cuerpo"])

    def test_aviso_al_tutor_dice_familia(self):
        self._set_email_tutor("alumno1.4a@insi.edu.ar", "tutor@ejemplo.com")
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        aviso = [a for a in self._cola() if a["esTutor"]][0]
        self.assertIn("familia", aviso["cuerpo"].lower())
        self.assertIn("Ana Torres", aviso["cuerpo"])

    def test_tarde_incluye_los_minutos(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Tarde",
                        "minutosRetraso": 25}])
        self.assertIn("25 minutos tarde", self._cola()[0]["cuerpo"])

    def test_cuerpo_nombra_a_quien_tomo_la_lista(self):
        # Si el docente no se nombra, la familia no sabe a quién dirigirse.
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertIn("Laura Mart", self._cola()[0]["cuerpo"])

    def test_turno_redactado_correctamente(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        cuerpo = self._cola()[0]["cuerpo"]
        self.assertIn("en el turno de la mañana", cuerpo)
        self.assertNotIn("turno mañana", cuerpo)

    def test_sin_doble_espacio_al_alumno(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertNotIn("informamos  que", self._cola()[0]["cuerpo"])

    def test_materia_en_el_asunto(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}],
                      gmail="admin@insi.edu.ar", tipo="materia")
        self.assertIn("Historia", self._cola()[0]["cuerpo"])

    def test_turno_en_el_cuerpo_institucional(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertIn("turno", self._cola()[0]["cuerpo"].lower())

    def test_remitente_usa_el_nombre_de_la_escuela(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        self.assertIn("Instituto Test", self._cola()[0]["remitente"])

    def test_aviso_arranca_pendiente(self):
        self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        aviso = self._cola()[0]
        self.assertEqual(aviso["estadoEnvio"], "pendiente")
        self.assertEqual(aviso["intentos"], 0)
        self.assertIsNone(aviso["enviado"])

    # --- casos límite -------------------------------------------------------

    def test_alumno_inexistente_no_encola(self):
        self._guardar([{"gmail": "alumno1.4b@insi.edu.ar", "estado": "Ausente"}])
        self.assertEqual(self._cola(), [])

    def test_fallo_al_encolar_no_rompe_el_guardado(self):
        import cuaderno.asistencia_views as av
        original = av.encolar_inasistencia
        av.encolar_inasistencia = MagicMock(side_effect=RuntimeError("boom"))
        self.addCleanup(setattr, av, "encolar_inasistencia", original)
        resp = self._guardar([{"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"}])
        # La vista no propaga la excepción: el registro queda guardado.
        self.assertEqual(resp.status_code, 200)

    def test_fallo_en_enqueue_se_absorbe_dentro_del_modulo(self):
        import cuaderno.notificaciones as notif
        self._db["notificaciones"].insert_one = MagicMock(side_effect=RuntimeError("no mongo"))
        self.assertEqual(notif.encolar_inasistencia({
            "estado": "Ausente", "alumnoGmail": "alumno1.4a@insi.edu.ar",
            "tipo": "institucional", "curso": "4A", "fecha": self.FECHA, "turno": "mañana",
        }), 0)

    def test_varios_alumnos_en_la_misma_lista(self):
        self._db["usuarios"].insert_one({
            "Gmail": "alumno2.4a@insi.edu.ar", "Nombres": "Belén", "Apellido": "Sosa",
            "Curso": "4A", "Rol": "Alumno", "estado": "Activo",
            "EmailTutor": "tutor2@ejemplo.com",
        })
        resp = self._guardar([
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Ausente"},
            {"gmail": "alumno2.4a@insi.edu.ar", "estado": "Ausente"},
            {"gmail": "alumno1.4a@insi.edu.ar", "estado": "Presente"},
        ])
        # 1 (alumno1) + 2 (alumno2 con tutor) = 3 avisos
        self.assertEqual(_json_resp(resp)["notificaciones"], 3)


class _Salida:
    """stdout/stderr en memoria para probar comandos de management."""

    def __init__(self, buffer):
        self._buffer = buffer

    def write(self, texto):
        self._buffer.write(texto)

    def flush(self):
        pass


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class TestComandoEnviarNotificaciones(SimpleTestCase):
    """El comando envía la cola, respeta los límites y registra los errores."""

    FECHA = "2026-09-28"

    def setUp(self):
        self._db = _make_db()
        import cuaderno.auth
        import cuaderno.management.commands.enviar_notificaciones as cmd
        for modulo in (cuaderno.auth, cmd):
            self.addCleanup(setattr, modulo, "_mongo_db", modulo._mongo_db)
            modulo._mongo_db = self._db
        self.cmd = cmd
        from django.core import mail
        self.bandeja = mail.outbox
        del self.bandeja[:]

    def _encolar(self, para, **extra):
        aviso = {
            "clave": para, "para": para, "esTutor": False,
            "asunto": "Aviso de inasistencia", "cuerpo": "Hola",
            "remitente": "Instituto Test <no-reply@localhost>",
            "alumno": para, "alumnoNombre": "Ana Torres", "curso": "4A",
            "fecha": self.FECHA, "estado": "Ausente", "tipo": "institucional",
            "turno": "mañana", "materia": "", "estadoEnvio": "pendiente",
            "intentos": 0, "creado": "2026-09-28T08:00:00", "enviado": None,
        }
        aviso.update(extra)
        self._db["notificaciones"].insert_one(aviso)
        return aviso

    def _correr(self, *argv):
        """Ejecuta el comando pasando por su parser, como lo haría la consola."""
        from io import StringIO
        cmd = self.cmd.Command()
        parser = cmd.create_parser("manage.py", "enviar_notificaciones")
        opciones = vars(parser.parse_args(list(argv)))
        salida, errores = StringIO(), StringIO()
        cmd.stdout = _Salida(salida)
        cmd.stderr = _Salida(errores)
        cmd.handle(**opciones)
        return salida.getvalue(), errores.getvalue()

    def _en_base(self):
        return {d["clave"]: d for d in self._db["notificaciones"]._docs}

    # --- envío normal -------------------------------------------------------

    def test_envia_lo_pendiente(self):
        self._encolar("a@insi.edu.ar")
        self._encolar("tutor@ejemplo.com")
        self._correr()
        self.assertEqual(len(self.bandeja), 2)

    def test_marca_como_enviado(self):
        self._encolar("a@insi.edu.ar")
        self._correr()
        aviso = self._en_base()["a@insi.edu.ar"]
        self.assertEqual(aviso["estadoEnvio"], "enviado")
        self.assertEqual(aviso["intentos"], 1)
        self.assertIsNotNone(aviso["enviado"])
        self.assertEqual(aviso["error"], "")

    def test_no_reenvia_lo_ya_enviado(self):
        self._encolar("a@insi.edu.ar", estadoEnvio="enviado", enviado="2026-09-28T09:00:00")
        self._correr()
        self.assertEqual(self.bandeja, [])

    def test_conserva_asunto_cuerpo_y_remitente(self):
        self._encolar("a@insi.edu.ar", asunto="Asunto X", cuerpo="Cuerpo Y",
                      remitente="Escuela <remitente@insi.edu.ar>")
        self._correr()
        correo = self.bandeja[0]
        self.assertEqual(correo.subject, "Asunto X")
        self.assertEqual(correo.body, "Cuerpo Y")
        self.assertEqual(correo.to, ["a@insi.edu.ar"])
        self.assertEqual(correo.from_email, "Escuela <remitente@insi.edu.ar>")

    def test_ordena_por_creacion(self):
        self._encolar("tarde@insi.edu.ar", creado="2026-09-28T10:00:00")
        self._encolar("temprano@insi.edu.ar", creado="2026-09-28T07:00:00")
        self._correr()
        self.assertEqual([c.to[0] for c in self.bandeja],
                         ["temprano@insi.edu.ar", "tarde@insi.edu.ar"])

    # --- límites ------------------------------------------------------------

    def test_respeta_el_limite(self):
        for i in range(5):
            self._encolar(f"a{i}@insi.edu.ar", creado=f"2026-09-28T0{i}:00:00")
        self._correr("--limite","2")
        self.assertEqual(len(self.bandeja), 2)
        # Los tres restantes siguen en cola.
        self.assertEqual(sum(1 for a in self._en_base().values()
                             if a["estadoEnvio"] == "pendiente"), 3)

    def test_cola_vacia(self):
        salida, _ = self._correr()
        self.assertIn("No hay avisos pendientes", salida)

    # --dry-run no envía ------------------------------------------------------

    def test_dry_run_no_envia(self):
        self._encolar("a@insi.edu.ar")
        salida, _ = self._correr("--dry-run")
        self.assertEqual(self.bandeja, [])
        self.assertIn("dry-run", salida)
        self.assertEqual(self._en_base()["a@insi.edu.ar"]["estadoEnvio"], "pendiente")

    # --- errores ------------------------------------------------------------

    def test_error_deja_el_aviso_pendiente(self):
        self._encolar("a@insi.edu.ar")
        original = self.cmd.EmailMessage

        def falla(*a, **kw):
            raise OSError("smtp caido")

        self.cmd.EmailMessage = falla
        self.addCleanup(setattr, self.cmd, "EmailMessage", original)
        self._correr()
        aviso = self._en_base()["a@insi.edu.ar"]
        self.assertEqual(aviso["estadoEnvio"], "pendiente")
        self.assertEqual(aviso["intentos"], 1)
        self.assertIn("smtp caido", aviso["error"])

    def test_agotar_intentos_lo_marca_fallido(self):
        self._encolar("a@insi.edu.ar")
        original = self.cmd.EmailMessage

        def falla(*a, **kw):
            raise OSError("smtp caido")

        self.cmd.EmailMessage = falla
        self.addCleanup(setattr, self.cmd, "EmailMessage", original)
        for _ in range(5):
            self._correr("--reintentar-fallidos")
        aviso = self._en_base()["a@insi.edu.ar"]
        self.assertEqual(aviso["estadoEnvio"], "fallido")
        self.assertEqual(aviso["intentos"], 5)

    def test_no_reintenta_un_aviso_fallido_agotado(self):
        self._encolar("a@insi.edu.ar", estadoEnvio="fallido", intentos=5)
        self._correr("--reintentar-fallidos")
        self.assertEqual(self.bandeja, [])

    def test_reintentar_fallidos_incluye_a_los_pendientes(self):
        self._encolar("fallo@insi.edu.ar", estadoEnvio="fallido", intentos=1)
        self._encolar("pend@insi.edu.ar")
        self._correr("--reintentar-fallidos")
        self.assertEqual(len(self.bandeja), 2)

    # --ver-cola -------------------------------------------------------------

    def test_ver_cola_muestra_los_conteos(self):
        self._encolar("a@insi.edu.ar")
        self._encolar("b@insi.edu.ar", estadoEnvio="enviado", enviado="2026-09-28T09:00:00")
        salida, _ = self._correr("--ver-cola")
        self.assertIn("pendiente: 1", salida)
        self.assertIn("enviado: 1", salida)
        self.assertIn("a@insi.edu.ar", salida)
        self.assertEqual(self.bandeja, [])


if __name__ == "__main__":
    unittest.main()
