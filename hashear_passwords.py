import bcrypt

from config import db as db_conf

client = db_conf.get_client()
db = client[db_conf.get_db_name()]

usuarios = list(db.usuarios.find({}))
print(f"Total usuarios encontrados: {len(usuarios)}")

hasheados = 0
ya_estaban = 0
errores = 0

for u in usuarios:
    contraseña_actual = u.get("Contraseña")

    if not contraseña_actual:
        print(f"Usuario sin Contraseña: {u.get('Apellido', u['_id'])}")
        errores += 1
        continue

    # Evitar rehashear algo que ya es un hash de bcrypt
    if contraseña_actual.startswith("$2b$") or contraseña_actual.startswith("$2a$"):
        ya_estaban += 1
        continue

    hash_nuevo = bcrypt.hashpw(contraseña_actual.encode("utf-8"), bcrypt.gensalt())

    db.usuarios.update_one(
        {"_id": u["_id"]},
        {"$set": {"Contraseña": hash_nuevo.decode("utf-8")}}
    )
    hasheados += 1

print(f"Hasheadas ahora: {hasheados}")
print(f"Ya estaban hasheadas: {ya_estaban}")
print(f"Con errores: {errores}")
print(f"Total: {hasheados + ya_estaban + errores} / {len(usuarios)}")
client.close()
