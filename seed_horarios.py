"""
Script de ejemplo para cargar horarios en MongoDB.
Ejecutalo con: python seed_horarios.py

Ajustá la conexión (MONGO_URI / nombre de base) para que coincida
con la que ya usás en tu db_seed.py o en settings.py.
"""

from config import db as db_conf

client = db_conf.get_client()
db = client[db_conf.get_db_name()]
horarios = db["horarios"]

HORARIOS_A_CARGAR = [
    {
        "Curso": "3A",
        "Dias": {
            "Lunes": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "SISTEMAS TECNOLOGICOS (G2)", "Profesor": "MEDINA"},
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "SISTEMAS TECNOLOGICOS (G1)", "Profesor": "ZACARIAS"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "HISTORIA", "Profesor": "GRAÑA. A"},
            
            ],
            "Martes": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "SISTEMAS TECNOLOGICOS (G2)", "Profesor": "MEDINA"},
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "PROCEDIMIENTOS TECNOLOGICOS (G1)", "Profesor": "BRANDAN"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "ARTISTICA", "Profesor": "MOYANO"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "MATEMÁTICA", "Profesor": "MAGARIÑOS. P"},
                {"Inicio": "14:00", "Fin": "16:00", "Materia": "EDUCACION FISICA", "Profesor": "MESQUIDA. S"},
            ],
            "Miercoles": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "INGLES", "Profesor": "ANDRADE. S"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "PRACTICAS DEL LENGUAJE", "Profesor": "FRETES. S"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "GEOGRAFIA", "Profesor": "SERVIN. L"},
                {"Inicio": "14:00", "Fin": "16:00", "Materia": "BIOLOGIA", "Profesor": "BADALOVICH. F"},
                {"Inicio": "16:10", "Fin": "18:10", "Materia": "FISICO-QUIMICA", "Profesor": "MARTINEZ. A"},

            ],
            "Jueves": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "PROCEDIMIENTOS TECNOLOGICOS (G2)", "Profesor": "VALLEJOS. L"},
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "SISTEMAS TECNOLOGICOS (G1)", "Profesor": "VALLEJOS. L"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "FORMACIÓN PRELIGIOSA", "Profesor": "BRAVO"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "MATEMÁTICA", "Profesor": "MAGARIÑOS. P"},
                {"Inicio": "14:00", "Fin": "16:00", "Materia": "CONSTRUCCION DE LA CIUDADANIA", "Profesor": "LUCISSANO. H"},
            ],
            "Viernes": [
              {"Inicio": "07:30", "Fin": "09:30", "Materia": "FISICO-QUIMICA", "Profesor": "RAMIRES. N"},
              {"Inicio": "09:40", "Fin": "11:40", "Materia": "LENGUAJE TECNOLOGICO (G2)", "Profesor": "PEREYRA"},
              {"Inicio": "09:40", "Fin": "11:40", "Materia": "LENGUAJE TECNOLOGICO (G1)", "Profesor": "DONATO"},
              {"Inicio": "11:50", "Fin": "13:50", "Materia": "PRACTICAS DEL LENGUAJE", "Profesor": "FRETES. S"},

            ]
    }
    
    },
      {
        "Curso": "3B",
        "Dias": {
            "Lunes": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "FISICO-QUIMICA ", "Profesor": "MARTINEZ. A"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "PRACTICAS DEL LENGUAJE", "Profesor": "JUAN. D"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "FORMACIÓN PRELIGIOSA", "Profesor": "LEGUIZAMON. R"},
                {"Inicio": "14:00", "Fin": "16:00", "Materia": "EDUCACION FISICA", "Profesor": "MESQUIDA. S"},
                {"Inicio": "16:10", "Fin": "18:10", "Materia": "SISTEMAS TECNOLOGICOS (G2)", "Profesor": "PARREÑO"},
            ],
            "Martes": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "ARTISTICA ", "Profesor": "MOYANO. D"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "MATEMÁTICA", "Profesor": "MAGARIÑOS. P"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "CONSTRICCION DE LA CIUDADANIA", "Profesor": "MAROTTA. V"},
            ],
            "Miercoles": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "BIOLOGIA", "Profesor": "BADALOVICH. F"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "INGLES", "Profesor": "ANDRADE. S"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "SISTEMAS TECNOLOGICOS (G1)", "Profesor": "ZACARIAS"},
                 {"Inicio": "11:50", "Fin": "13:50", "Materia": "PROCEDIMIENTOS TECNOLOGICOS (G2)", "Profesor": "BRANDAN"},
                {"Inicio": "14:00", "Fin": "16:00", "Materia": "GEOGRAFIA", "Profesor": "MANSILLA. A"},
                {"Inicio": "16:10", "Fin": "18:10", "Materia": "PRACTICAS DEL LENGUAJE", "Profesor": "JUAN. D"}, 
            ],
            "Jueves": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "SISTEMAS TECNOLOGICOS (G1)", "Profesor": "ZACARIAS"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "HISTORIA", "Profesor": "GRAÑA. A"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "FISICO-QUIMICA", "Profesor": "MARTINEZ. A"},
            ],
            "Viernes": [
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "LENGUAJE TECNOLOGICO (G2)", "Profesor": "MEDINA"},
                {"Inicio": "07:30", "Fin": "09:30", "Materia": "PROCEDIMIENTOS TECNOLOGICOS (G1)", "Profesor": "BRAVO"},
                {"Inicio": "09:40", "Fin": "11:40", "Materia": "MATEMÁTICA", "Profesor": "MAGARIÑOS. P"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "LENGUAJE TECNOLOGICO (G1)", "Profesor": "DONATO"},
                {"Inicio": "11:50", "Fin": "13:50", "Materia": "SISTEMAS TECNOLOGICOS (G2)", "Profesor": "MEDINA"},

               
            ]
    }
    
    },

    
    # Sumá acá un diccionario más por cada curso (7B, 6A, 6B, etc.)
]

for horario in HORARIOS_A_CARGAR:
    # update_one con upsert=True: si ya existe un horario para ese curso, lo
    # actualiza en vez de duplicarlo. Podés correr el script varias veces
    # sin miedo a crear copias repetidas.
    resultado = horarios.update_one(
        {"Curso": horario["Curso"]},
        {"$set": horario},
        upsert=True,
    )
    accion = "creado" if resultado.upserted_id else "actualizado"
    print(f"Horario de {horario['Curso']}: {accion}")

print("Listo.")