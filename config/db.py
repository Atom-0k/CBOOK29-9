"""Conexión centralizada a MongoDB.

Único punto del proyecto que construye la URI y el cliente de MongoDB.
Todos los módulos (vistas, scripts) deben usar estas funciones en lugar
de hardcodear "mongodb://localhost:27017".

La autenticación y TLS se configuran por variables de entorno (ver
.env.example). Ninguna credencial se hardcodea acá.

Variables soportadas:
  * MONGO_URI                    -> URI completa (si se define, tiene prioridad).
  * MONGO_HOST / MONGO_PORT      -> host y puerto (default: localhost:27017).
  * MONGO_USER / MONGO_PASSWORD  -> usuario dedicado de aplicación (NUNCA root/admin).
  * MONGO_AUTH_SOURCE            -> base de autenticación (default: admin).
  * MONGO_DB_NAME                -> base de datos de la aplicación (default: cuaderno_db).
  * MONGO_TLS                    -> true/false: habilita TLS en la conexión.
  * MONGO_TLS_CAFILE             -> ruta al CA/self-signed para validar el server (sin verificación NO se acepta).
  * MONGO_TLS_CERT_KEY_FILE      -> ruta al certificado+clave del cliente (mutual TLS, opcional).
  * MONGO_TLS_REQUIRED           -> true: exige TLS (default: true en producción).
  * MONGO_TLS_ALLOW_INSECURE     -> true desactivaría la verificación del cert: SOLO desarrollo, NUNCA producción.
  * MONGO_TIMEOUT_MS             -> timeout de selección de server (default: 5000).

Reglas de seguridad:
  * En producción (DJANGO_DEBUG=False) el TLS es obligatorio por defecto y
    jamás se aceptan certificados sin verificar.
  * La aplicación usa un usuario DEDICADO con mínimo privilegio (lectura y
    escritura solo en MONGO_DB_NAME). La creación del usuario es manual en
    el servidor Mongo (ver .env.example) y NO se automatiza acá.
"""
from urllib.parse import quote_plus

from pymongo import MongoClient

from . import env


def _es_produccion():
    return not env.env_bool("DJANGO_DEBUG", True)


def _tls_params():
    """Devuelve los parámetros de consulta TLS, validando los flags de seguridad."""
    tls = env.env_bool("MONGO_TLS", False)
    tls_required = env.env_bool("MONGO_TLS_REQUIRED", _es_produccion())
    allow_insecure = env.env_bool("MONGO_TLS_ALLOW_INSECURE", False)

    if _es_produccion() and allow_insecure:
        raise RuntimeError(
            "MONGO_TLS_ALLOW_INSECURE=True está prohibido en producción. "
            "Configurá MONGO_TLS_CAFILE con el certificado del servidor."
        )

    if tls_required and not tls:
        raise RuntimeError(
            "En producción MongoDB requiere TLS. Definí MONGO_TLS=True "
            "y MONGO_TLS_CAFILE con el certificado del servidor."
        )

    params = []
    if tls:
        params.append("tls=true")
        ca = env.env("MONGO_TLS_CAFILE")
        if ca:
            params.append(f"tlsCAFile={quote_plus(ca)}")
        cert = env.env("MONGO_TLS_CERT_KEY_FILE")
        if cert:
            params.append(f"tlsCertificateKeyFile={quote_plus(cert)}")
        if allow_insecure:
            params.append("tlsAllowInvalidCertificates=true")
    return params


def build_mongo_uri():
    """Devuelve la URI de conexión construida desde el entorno."""
    uri = env.env("MONGO_URI")
    if uri:
        # Si se da una URI completa, aún así se validan los flags de seguridad.
        _tls_params()
        return uri

    host = env.env("MONGO_HOST", "localhost")
    port = env.env("MONGO_PORT", "27017")
    user = env.env("MONGO_USER")
    password = env.env("MONGO_PASSWORD")
    auth_source = env.env("MONGO_AUTH_SOURCE", "admin")

    creds = ""
    params = []
    if user:
        u = quote_plus(user)
        p = quote_plus(password or "")
        creds = f"{u}:{p}@"
        params.append(f"authSource={auth_source}")
    params.extend(_tls_params())

    querystring = ("?" + "&".join(params)) if params else ""

    return f"mongodb://{creds}{host}:{port}/{querystring}"


def get_db_name():
    return env.env("MONGO_DB_NAME", "cuaderno_db")


def get_client():
    """Cliente Mongo con timeout corto para no colgar el server."""
    return MongoClient(
        build_mongo_uri(),
        serverSelectionTimeoutMS=env.env_int("MONGO_TIMEOUT_MS", 5000),
    )


def get_db():
    return get_client()[get_db_name()]
