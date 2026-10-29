import bcrypt

from config import db as db_conf

client = db_conf.get_client()
db = client[db_conf.get_db_name()]

usuarios = list(db.usuarios.find({"Rol": "Alumno"}))
print(f"Total alumnos encontrados: {len(usuarios)}")

hasheados = 0
ya_estaban = 0
errores = 0

for u in usuarios:
    pin_actual = u.get("pinResponsable")

    if not pin_actual:
        print(f"Usuario sin PIN: {u.get('Apellido', u['_id'])}")
        errores += 1
        continue

    # Evitar volver a hashear un PIN ya hasheado
    if pin_actual.startswith("$2b$") or pin_actual.startswith("$2a$"):
        ya_estaban += 1
        continue

    hash_nuevo = bcrypt.hashpw(
        pin_actual.encode("utf-8"),
        bcrypt.gensalt()
    )

    db.usuarios.update_one(
        {"_id": u["_id"]},
        {"$set": {"pinResponsable": hash_nuevo.decode("utf-8")}}
    )

    hasheados += 1

print(f"PIN hasheados ahora: {hasheados}")
print(f"Ya estaban hasheados: {ya_estaban}")
print(f"Con errores: {errores}")
print(f"Total: {hasheados + ya_estaban + errores} / {len(usuarios)}")
client.close()
