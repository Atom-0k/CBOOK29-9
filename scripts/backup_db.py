"""Backup de la base de datos completo (fuera del repo) con cifrado opcional.

Guarda un JSON de todas las colecciones en BACKUP_DIR (env) con nombre
backup_<fecha>.json. Si BACKUP_ENCRYPTION_KEY (Fernet) está definido y
cryptography está instalado, el archivo se cifra antes de escribirse.

Uso:
    python scripts/backup_db.py
"""
import json
import sys
from datetime import datetime
from pathlib import Path
from bson import ObjectId

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import db as db_conf
from config import env as env_conf

COLECCIONES = (
    "usuarios", "cursos", "asignaciones", "notas", "calificaciones",
    "horarios", "auditoria", "config", "backups", "intentos_login",
    # Asistencia: los registros diarios, las actas archivadas con su estado
    # congelado y la cola de avisos de inasistencia.
    "asistencias", "asistencia_actas", "notificaciones",
)


def _a_json(v):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, dict):
        return {k: _a_json(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_a_json(x) for x in v]
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _cifrar(datos: bytes) -> bytes:
    clave = env_conf.env("BACKUP_ENCRYPTION_KEY")
    if not clave:
        return datos
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        print("ADVERTENCIA: BACKUP_ENCRYPTION_KEY definida pero 'cryptography' no está"
              " instalado. El backup se guarda SIN cifrar.")
        return datos
    return Fernet(clave.encode()).encrypt(datos)


def main():
    client = db_conf.get_client()
    db = client[db_conf.get_db_name()]

    snapshot = {c: [_a_json(d) for d in db[c].find({})] for c in COLECCIONES}

    backup_dir = Path(env_conf.env("BACKUP_DIR") or "backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    nombre = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    ruta = backup_dir / nombre

    contenido = json.dumps(snapshot, ensure_ascii=False, indent=1).encode("utf-8")
    contenido = _cifrar(contenido)

    ruta.write_bytes(contenido)
    cifrado = bool(env_conf.env("BACKUP_ENCRYPTION_KEY"))
    print(f"Backup guardado: {ruta.resolve()} ({len(contenido)} bytes, cifrado={cifrado})")

    conteo = {c: len(snapshot[c]) for c in COLECCIONES}
    print("Conteos:", conteo)
    client.close()


if __name__ == "__main__":
    main()
