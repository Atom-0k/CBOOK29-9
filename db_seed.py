import json
import os

from config import db as db_conf


def cargar_datos():
    client = db_conf.get_client()
    db = client[db_conf.get_db_name()]
    coleccion = db["usuarios"]

    ruta_json = os.path.join('data', 'inicial.json')

    try:
        with open(ruta_json, 'r', encoding='utf-8') as f:
            datos = json.load(f)

        if isinstance(datos, list):
            coleccion.insert_many(datos)
        else:
            coleccion.insert_one(datos)

        print(f"OK: Datos de '{ruta_json}' cargados en la colección 'usuarios'.")

    except FileNotFoundError:
        print(f"ERROR: No encontré el archivo en {ruta_json}")
    except json.JSONDecodeError:
        print(f"ERROR: El archivo '{ruta_json}' no tiene un formato JSON válido.")
    except Exception as e:
        print(f"ERROR inesperado: {e}")
    finally:
        client.close()


if __name__ == "__main__":
    cargar_datos()
