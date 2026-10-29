---
Diagrama de Entidad-Relación — Cuaderno Digital (MongoDB: cuaderno_db)
Generado desde: cuaderno/views.py, cuaderno/admin_views.py, cuaderno/asistencia_views.py, cuaderno/auth.py
---

erDiagram

    USUARIOS {
        ObjectId _id PK
        string Gmail UK
        string Contrasena
        string Apellido
        string Nombres
        string Curso
        string Rol
        string Turno
        int Numero
        string estado "Activo|Bloqueado|Baja|Suspendido"
        string FechaCreacion
        string UltimoIngreso
        string pinResponsable
        boolean pin_habilitado
        int pin_intentos_fallidos
        string pin_ultimo_uso
        string pin_fecha_creacion
        object bloqueo
        object baja
        array historial_estados
    }

    CURSOS {
        ObjectId _id PK
        string nombre UK
        string especialidad
        string anio_lectivo
        boolean activo
    }

    ASIGNACIONES {
        ObjectId _id PK
        ObjectId usuario_id FK
        ObjectId curso_id FK
        string materia
        string rol "Profesor|preceptor"
    }

    NOTAS {
        ObjectId _id PK
        string Curso
        string AlumnoGmail FK
        string Tipo "comunicado|amonestacion|citacion|felicitacion"
        string Titulo
        string Contenido
        string Autor
        string AutorGmail FK
        string AutorRol
        string Fecha
        boolean Leida
        boolean requierePin
        string pinResponsable
        array firmas
        array alumnos
        boolean confirmada
        string confirmadaFecha
        string confirmadaPor
        boolean todosFirmaron
        string AsignacionId FK
        string AsignacionMateria
        string AsignacionCurso
        boolean eliminada
        string eliminadaFecha
        boolean archivada
    }

    CALIFICACIONES {
        ObjectId _id PK
        string Curso
        string Materia
        string AlumnoGmail FK
        int Cuatrimestre
        int Fila
        string Fecha
        string Detalle
        string FirmaDocente
        string FirmaPadre
        string Tipo "final"
        string Nota
    }

    HORARIOS {
        ObjectId _id PK
        string Curso FK
        object Dias
    }

    ASISTENCIAS {
        ObjectId _id PK
        string tipo "institucional|materia"
        string alumnoGmail FK
        string anio_lectivo
        string curso FK
        string fecha
        string turno
        string materia FK
        string estado "Presente|Ausente|Tarde"
        int minutosRetraso
        string horaIngreso
        string observacion
        string registradoPor
        string registradoPorGmail
        string registradoPorRol
        string creado
        string modificado
        object justificacion
        boolean eliminada
        array historial
    }

    AUDITORIA {
        ObjectId _id PK
        string Fecha
        string Usuario FK
        string Accion
        string Detalle
        string IP
        string Navegador
        string SO
    }

    CONFIG {
        string _id PK
        string nombre_escuela
        string anio_lectivo
        int duracion_sesion_min
        int long_min_contrasena
        int long_pin
        boolean modo_mantenimiento
        boolean notificaciones_email
        int limite_inasistencias
        int porcentaje_min_asistencia
        int minutos_tolerancia_tardia
    }

    INTENTOS_LOGIN {
        ObjectId _id PK
        string clave
        datetime fecha
    }

    BACKUPS {
        ObjectId _id PK
        string Nombre
        string Fecha
        int Tamano
        string CreadoPor FK
    }

    %% =============================================
    %% RELACIONES
    %% =============================================

    USUARIOS ||--o{ ASIGNACIONES : "tiene asignaciones"
    CURSOS ||--o{ ASIGNACIONES : "recibe asignaciones"

    USUARIOS ||--o{ NOTAS : "envía notas (AutorGmail)"
    USUARIOS ||--o{ NOTAS : "recibe notas (AlumnoGmail)"
    CURSOS ||--o{ NOTAS : "recibe notas"
    ASIGNACIONES ||--o{ NOTAS : "vincula nota a contexto"

    USUARIOS ||--o{ CALIFICACIONES : "tiene calificaciones"
    CURSOS ||--o{ CALIFICACIONES : "tiene calificaciones"
    CURSOS ||--o{ HORARIOS : "tiene horario"

    USUARIOS ||--o{ ASISTENCIAS : "tiene asistencia"
    CURSOS ||--o{ ASISTENCIAS : "tiene asistencia"

    USUARIOS ||--o{ AUDITORIA : "genera auditoría"

    USUARIOS ||--o{ BACKUPS : "crea backups"
