"""Carga de variables de entorno centralizada.

Todas las rutas del proyecto (settings, scripts y vistas) leen la
configuración sensible desde variables de entorno / .env. Nunca se
hardcodean credenciales en el código.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# SKIP_DOTENV=1 se usa SOLO en pruebas/CI para simular producción sin el
# archivo .env (evita que el .env de desarrollo contamine la ejecución).
if not os.environ.get("SKIP_DOTENV", "").strip().lower() in ("1", "true", "yes", "on"):
    load_dotenv(BASE_DIR / ".env")


def env(name, default=None):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def env_int(name, default=0):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def env_list(name, default=None):
    raw = os.environ.get(name)
    if not raw:
        return list(default or [])
    return [x.strip() for x in raw.split(",") if x.strip()]
