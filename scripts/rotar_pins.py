"""Rotación masiva de PINs de alumnos.

IMPORTANTE:
  * Por defecto corre en modo DRY-RUN: no escribe nada, solo calcula.
  * Con --aplicar guarda los nuevos PINs (siempre como hash bcrypt) y
    escribe el listado de PINs nuevos en un archivo de entrega FUERA del
    repositorio (para dárselo a la institución).

Seguridad:
  * PINs generados con random.SystemRandom (aleatoriedad criptográfica).
  * NUNCA se imprimen PINs por consola; solo van al archivo de entrega.
  * El archivo de entrega vive fuera del repo (PIN_OUTPUT_DIR o un
    directorio hermano); si se indica una ruta dentro del repo, el script
    aborta.
  * Los PINs se guardan solo como hash bcrypt.
  * Reanudable ante errores: cada usuario se marca pin_rotado y se escribe
    su línea en el archivo y luego pin_entregado. Si el proceso se corta a
    la mitad, volver a correrlo re-rota solo lo pendiente.
  * Guard atómico: el update solo aplica si el hash previo no cambió, así
    no se pisa por accidente un usuario cuya PIN ya fue modificado.

Uso:
    python scripts/rotar_pins.py                        # dry-run
    python scripts/rotar_pins.py --aplicar              # rotación real (pide confirmación)
    python scripts/rotar_pins.py --aplicar --si         # rotación real no interactiva
    python scripts/rotar_pins.py --curso 7A --aplicar   # solo un curso
    python scripts/rotar_pins.py --aplicar --archivo C:/ruta/fuera/repo/pins.txt
"""
import argparse
import random
import string
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt

from config import db as db_conf
from config import env as env_conf

BASE_DIR = env_conf.BASE_DIR


def _generar_pin(largo=8):
    return "".join(random.SystemRandom().choices(string.digits, k=largo))


def _es_hash_bcrypt(valor):
    return bool(valor) and str(valor).startswith("$2")


def _rotado_completo(doc):
    return bool(doc.get("pin_rotado") and doc.get("pin_entregado"))


def clasificar_alumnos(db, curso=""):
    """Devuelve (candidatos, ya_rotados, sin_pin, bloqueados)."""
    filtro = {"Rol": "Alumno"}
    if curso:
        filtro["Curso"] = curso

    alumnos = list(db.usuarios.find(filtro))

    candidatos, ya_rotados, sin_pin, bloqueados = [], [], [], []
    for a in alumnos:
        pin = a.get("pinResponsable")
        if _rotado_completo(a):
            ya_rotados.append(a)
        elif not _es_hash_bcrypt(pin):
            sin_pin.append(a)
        elif not a.get("pin_habilitado", True):
            bloqueados.append(a)
        else:
            candidatos.append(a)
    return candidatos, ya_rotados, sin_pin, bloqueados


def resolver_archivo_salida(archivo, curso=""):
    """Resuelve y valida la ruta del archivo de entrega (nunca en el repo)."""
    ahora = datetime.now().strftime("%Y%m%d_%H%M%S")
    sufijo = f"_{curso}" if curso else ""
    nombre = f"PINs_NUEVOS{sufijo}_{ahora}.txt"

    if archivo:
        destino = Path(archivo).resolve()
    else:
        dir_salida = env_conf.env("PIN_OUTPUT_DIR")
        if dir_salida:
            destino = (Path(dir_salida).resolve() / nombre)
        else:
            # Fuera del repo: directorio hermano al repositorio.
            destino = (BASE_DIR.parent / "Cuaderno-PINs" / nombre)

    if destino.is_relative_to(BASE_DIR):
        raise SystemExit(
            "ERROR: el archivo de entrega no puede estar dentro del repositorio. "
            "Usá PIN_OUTPUT_DIR o --archivo con una ruta externa."
        )
    destino.parent.mkdir(parents=True, exist_ok=True)
    return destino


def aplicar(db, candidatos, largo=8, archivo_salida=None, curso="", si=False):
    """Rota los PINs de los candidatos. Devuelve (rotados, conflictos, errores)."""
    if not si:
        confirmacion = input(
            "Vas a rotar %d PINs. Escribí ROTAR para confirmar: " % len(candidatos)
        ).strip()
        if confirmacion != "ROTAR":
            print("Cancelado.")
            return 0, 0, 0

    destino = resolver_archivo_salida(archivo_salida, curso)
    ahora = datetime.now().isoformat()
    rotados = 0
    conflictos = 0
    errores = 0

    with open(destino, "a", encoding="utf-8") as f:
        for a in candidatos:
            try:
                pin_nuevo = _generar_pin(largo)
                hash_nuevo = bcrypt.hashpw(
                    pin_nuevo.encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")

                # Guard atómico: solo aplica si el hash previo sigue igual.
                result = db.usuarios.update_one(
                    {"_id": a["_id"], "pinResponsable": a.get("pinResponsable")},
                    {"$set": {
                        "pinResponsable": hash_nuevo,
                        "pin_habilitado": True,
                        "pin_intentos_fallidos": 0,
                        "pin_ultimo_uso": "",
                        "pin_fecha_creacion": ahora,
                        "pin_rotado": True,
                    }},
                )
                if result.matched_count == 0:
                    conflictos += 1
                    print(f"  {a.get('Gmail', '')}: saltado (cambió en el medio)")
                    continue

                f.write(
                    f"{a.get('Apellido', '')}, {a.get('Nombres', '')} | "
                    f"{a.get('Gmail', '')} | {a.get('Curso', '')} | "
                    f"PIN nuevo: {pin_nuevo} | rotado: {ahora}\n"
                )
                f.flush()

                db.usuarios.update_one(
                    {"_id": a["_id"]},
                    {"$set": {"pin_entregado": True}},
                )
                rotados += 1
                print(f"  {a.get('Gmail', '')}: PIN rotado")
            except Exception:
                errores += 1
                print(f"  {a.get('Gmail', '')}: ERROR, se continuó con el resto")

    print(f"\nListado de entrega: {destino}")
    print("ADVERTENCIA: ese archivo contiene PINs en texto plano. NO lo versiones")
    print("y entrégalo solo a la institución. Volvé a correr el script para reanudar")
    print("si hubo errores (re-rota solo lo pendiente).")
    return rotados, conflictos, errores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--aplicar", action="store_true", help="Aplica la rotación (default: dry-run)")
    parser.add_argument("--si", action="store_true", help="Confirma sin pedir ROTAR por teclado")
    parser.add_argument("--curso", default="", help="Solo alumnos de este curso")
    parser.add_argument("--largo", type=int, default=8, help="Largo del PIN (default 8)")
    parser.add_argument("--archivo", default="", help="Archivo de entrega (fuera del repo)")
    args = parser.parse_args()

    if args.largo < 4 or args.largo > 12:
        print("ERROR: el largo del PIN debe estar entre 4 y 12.")
        sys.exit(1)

    client = db_conf.get_client()
    db = client[db_conf.get_db_name()]

    candidatos, ya_rotados, sin_pin, bloqueados = clasificar_alumnos(db, args.curso)
    total = len(candidatos) + len(ya_rotados) + len(sin_pin) + len(bloqueados)

    print(f"Total alumnos: {total}")
    print(f"Candidatos a rotar: {len(candidatos)}")
    print(f"Ya rotados en una corrida previa (no se tocan): {len(ya_rotados)}")
    print(f"Sin PIN (no se tocan): {len(sin_pin)}")
    print(f"PIN bloqueado/inhabilitado (no se tocan): {len(bloqueados)}")

    if not candidatos:
        print("\nNo hay PINs pendientes de rotación.")
        client.close()
        return

    if args.aplicar:
        if not args.curso:
            print("\nCONSEJO: hacé un backup antes de rotar: python scripts/backup_db.py")
        rotados, conflictos, errores = aplicar(
            db, candidatos, largo=args.largo,
            archivo_salida=args.archivo or None,
            curso=args.curso, si=args.si,
        )
        print(f"\nResumen: {rotados} rotados, {conflictos} conflictos, {errores} errores.")
    else:
        print("\nDRY-RUN: no se escribió nada. Ejecutá con --aplicar para rotar.")

    client.close()


if __name__ == "__main__":
    main()
