"""
Script para resetear la contraseña del administrador.

Conecta a MongoDB (vía config/db.py) y le asigna al admin una nueva
contraseña hasheada con bcrypt.

Seguridad:
  * NO hay contraseña por defecto ni hardcodeada.
  * La contraseña se puede pasar por --password, por la variable
    ADMIN_PASSWORD, o interactivamente con getpass (nunca se muestra al
    tipearla). Se desaconseja --password por la línea de comandos porque
    queda en el historial del shell.
  * La contraseña nunca se imprime ni se guarda en logs.
  * Se guarda SOLO como hash bcrypt en el campo Contraseña.

Uso:
    python reset_admin_password.py                                  # pide la clave por getpass
    python reset_admin_password.py --password "miNuevaClave"        # evita el historial
    $env:ADMIN_PASSWORD="miNuevaClave"; python reset_admin_password.py
"""
import argparse
import getpass
import os
import sys

import bcrypt

from config import db as db_conf

ADMIN_GMAIL = os.environ.get("ADMIN_GMAIL", "equipodirectivo@insi.edu.ar")


def validar_password(password):
    if not password or len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres."
    if password.isdigit():
        return False, "La contraseña no puede ser solo números."
    return True, None


def _obtener_password(args_password):
    if args_password:
        return args_password
    if os.environ.get("ADMIN_PASSWORD"):
        return os.environ["ADMIN_PASSWORD"]
    if sys.stdin.isatty():
        return getpass.getpass("Nueva contraseña del admin (no se muestra): ")
    raise SystemExit("ERROR: falta la contraseña. Usá ADMIN_PASSWORD o --password.")


def reset_admin_password(password: str, gmail: str = ADMIN_GMAIL):
    ok, msg = validar_password(password)
    if not ok:
        print(f"ERROR: {msg}")
        return False

    client = db_conf.get_client()
    db = client[db_conf.get_db_name()]

    hash_nuevo = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    result = db.usuarios.update_one(
        {"Gmail": gmail},
        {"$set": {"Contraseña": hash_nuevo, "Rol": "Admin"}},
    )

    if result.matched_count == 0:
        print(f"ERROR: No se encontró el usuario admin ({gmail}) en la base.")
        print("El script NO crea usuarios: creá el admin con la interfaz o seed.")
        client.close()
        return False

    client.close()
    print(f"Contraseña actualizada para {gmail} (no se imprime el hash ni la clave).")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Resetear contraseña del admin")
    parser.add_argument(
        "--password",
        default="",
        help="Nueva contraseña (mínimo 8 caracteres). Evitalo: queda en el historial.",
    )
    parser.add_argument(
        "--gmail",
        default=ADMIN_GMAIL,
        help="Gmail del admin (default: el de producción).",
    )
    args = parser.parse_args()

    password = _obtener_password(args.password)
    if not reset_admin_password(password, args.gmail):
        sys.exit(1)
