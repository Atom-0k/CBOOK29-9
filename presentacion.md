# Script de Presentación — Cuaderno Digital

> **Duración sugerida:** 15-20 minutos
> **Formato:** Dos expositores (tú y tu compañero)
> **Consejo:** Tener el navegador abierto con la app corriendo para ir demostrando en vivo.

---

## PARTE 1 — Introducción y problema (3-4 min)
**Expositor A**

---

### Apertura

> "Buenos días/tardes. El día de hoy les vamos a presentar el **Cuaderno Digital**, una aplicación web que reemplaza el cuaderno de comunicaciones tradicional de las escuelas por una versión 100% digital, moderna y segura."

### El problema que resuelve

> "En las escuelas, el cuaderno de comunicaciones es el medio principal para que los profesores y preceptores se comuniquen con los alumnos y sus familias. Pero el formato tradicional tiene varios problemas:"
>
> - **Se pierde información:** un cuaderno físico se puede extraviar, dañar o dejar en casa.
> - **No hay confirmación de lectura:** cuando se envía una nota, no hay forma de saber si el alumno o su responsable la leyó.
> - **Proceso lento y manual:** el preceptor tiene que escribir a mano, photocopiars, o enviar WhatsApps que se pierden en grupos enormes.
> - **Sin trazabilidad:** no queda registro de quién leyó qué y cuándo.

> "Nuestro sistema resuelve todos estos problemas centralizando todo en una plataforma web accesible desde cualquier dispositivo."

---

## PARTE 2 — Arquitectura y tecnología (3-4 min)
**Expositor B**

---

### Stack tecnológico

> "Vamos a repasar brevemente con qué está construido el sistema."

**Backend:**
> - **Python + Django 6** como framework web. Django nos da la estructura, las sesiones, el manejo de URLs y la separación clara entre lógica y presentación.
> - **MongoDB** como base de datos NoSQL. Elegimos MongoDB porque los documentos de un cuaderno digital son flexibles: notas, calificaciones, asistencias y configuración son estructuras muy distintas entre sí, y MongoDB se adapta sin necesidad de esquemas rígidos.
> - **PyMongo** como driver de conexión directa a MongoDB.

**Frontend:**
> - **React 18** con componentes modulares. Cada vista (alumno, profesor, preceptor, admin) es un módulo independiente.
> - **Tailwind CSS** para el diseño responsive y moderno.
> - **Vite** como bundler para un build rápido.
> - **Lucide React** para los íconos.

**Seguridad:**
> - **bcrypt** para hashear contraseñas y PINs. Nunca se almacenan en texto plano.
> - **Rate limiting** por IP y por cuenta para prevenir ataques de fuerza bruta.
> - **Variables de entorno** (.env) para toda la configuración sensible: no hay credenciales hardcodeadas.
> - **CSRF protection** de Django en todos los formularios.
> - **Auditoría completa:** cada acción relevante queda registrada con fecha, usuario, IP y navegador.

### Diagrama de arquitectura (descripción verbal)

> "La arquitectura es bastante directa: el navegador del usuario carga la app de React, que se comunica con el backend de Django a través de una API REST. Django consulta MongoDB para leer y escribir los datos. Las sesiones se manejan con cookies firmadas, y toda la lógica de permisos vive en el backend — el frontend nunca decide quién puede hacer qué."

---

## PARTE 3 — Funcionalidades por rol (8-10 min)
**Expositores A y B intercalados**

---

### 3.1 Rol: Alumno
**Expositor A** (demo en vivo)

> "Empecemos por lo que ve un alumno. Al loguearse, se encuentra con su panel personalizado."

**Demostración en vivo:**
1. **Inicio** — Resumen de notas recientes, acceso rápido a secciones.
2. **Mis Notas** — Lista de comunicados, amonestaciones, citaciones y felicitaciones recibidas. Si una nota requiere confirmación con PIN, el alumno puede firmarla directamente desde acá.
3. **Horarios** — Horario semanal del curso, editable solo por el preceptor.
4. **Mis Calificaciones** — Planilla por materia con 7 filas por cuatrimestre (fecha, detalle, firma del docente, firma del padre). El alumno o responsable puede firmar con su PIN.
5. **Mi Asistencia** — Resumen de inasistencias institucionales (con el límite configurable), porcentaje de asistencia por materia, e historial completo.
6. **Perfil** — Datos personales y cambio de contraseña.

> "Lo importante acá es que el alumno **no puede ver** a otros alumnos ni a otros cursos. Cada usuario solo ve su propia información."

### 3.2 Rol: Profesor
**Expositor B** (demo en vivo)

> "Ahora veamos qué herramientas tiene el profesor."

**Demostración en vivo:**
1. **Calificaciones** — Selecciona curso y materia, y carga la planilla de cada alumno: fecha, detalle, y su firma como docente se genera automáticamente.
2. **Enviar Nota** — Puede enviar comunicados, amonestaciones, citaciones o felicitaciones a todo un curso o a un alumno puntual. Puede requerir PIN para que el alumno confirme recepción.
3. **Historial de Notas** — Ve todas las notas que él envió, con el estado de confirmación de cada una (quién firmó, quién falta).
4. **Asistencia** — Registra la asistencia por materia: Presente, Ausente o Tarde (con minutos de retraso).

> "Un dato clave: el profesor **solo puede** cargar calificaciones y asistencia en los cursos y materias que le están asignados. Si un profesor da Matemática en 4A, no puede tocar las calificaciones de 4B ni de ninguna otra materia."

### 3.3 Rol: Preceptor
**Expositor A**

> "El preceptor es el enlace directo entre la escuela y los alumnos de su curso."

**Funcionalidades específicas:**
- **Asistencia institucional** — Registra la asistencia diaria por turno (mañana/tarde/contraturno) para todo su curso.
- **Editar Horarios** — Puede modificar el horario semanal de su curso.
- **Misma funcionalidad de notas** que el profesor.

> "La diferencia clave es que el preceptor tiene visión de **todo el curso**, mientras que el profesor solo ve su materia."

### 3.4 Rol: Administrador
**Expositor B** (demo en vivo)

> "El admin tiene control total del sistema."

**Demostración en vivo del panel admin:**

1. **Dashboard** — Vista general con estadísticas: cantidad de alumnos, profesores, preceptores, cursos, materias. Gráficos de notas por día, confirmaciones, distribución por tipo, y top de cursos más activos.

2. **Gestión de Usuarios** — CRUD completo de Alumnos, Profesores y Preceptores. Búsqueda con normalización (sin acentos), filtros por curso, rol y estado. Acciones: bloquear, dar de baja, reactivar, resetear contraseña, regenerar PIN. Cada acción queda en el historial del usuario.

3. **Gestión de Cursos** — Crear, editar, duplicar, activar/desactivar. Vista detallada con alumnos, materias y preceptores asignados.

4. **Gestión de Materias** — Asignar profesores a materias y cursos, renombrar o eliminar.

5. **Comunicados** — Visión global de todas las notas del sistema con filtros por curso, tipo, estado. Papelera, archivado, restauración.

6. **Confirmaciones** — Lista de todas las notas confirmadas con PIN, con fecha de confirmación y por quién.

7. **Gestión de PIN** — Generar, habilitar, deshabilitar, desbloquear PINs de alumnos. Dashboard con resumen: cuántos sin PIN, activos, bloqueados.

8. **Auditoría** — Log completo de todas las acciones del sistema: quién hizo qué, cuándo, desde qué IP y navegador.

9. **Backups** — Crear, restaurar y descargar backups de la base de datos completa en JSON.

10. **Configuración** — Parámetros institucionales: duración de sesión, límite de inasistencias, porcentaje mínimo de asistencia, tolerancia de tardanza, etc.

---

## PARTE 4 — Seguridad (2-3 min)
**Expositor A**

---

> "La seguridad fue un pilar fundamental del diseño. No es algo que se agregó al final, sino que está integrado en cada parte del sistema."

**Puntos clave:**

1. **Contraseñas hasheadas con bcrypt** — Nunca se almacenan en texto plano. Ni siquiera el admin puede ver la contraseña de un usuario.

2. **PINs con lockout** — Si un alumno falla el PIN 5 veces, su PIN se bloquea automáticamente. Solo un admin puede desbloquearlo.

3. **Rate limiting** — Se aplican límites de intentos tanto por IP como por cuenta de usuario, tanto para login como para PIN, para prevenir ataques de fuerza bruta.

4. **Permisos server-side** — Toda validación de permisos ocurre en el backend. El frontend muestra u oculta botones, pero el servidor es la última palabra. Un alumno nunca puede enviar una nota aunque modifique el código del navegador.

5. **Auditoría completa** — Cada acción relevante queda registrada en la colección `auditoria` con: fecha, usuario, acción, detalle, IP y navegador.

6. **Sesiones con expiración** — Las sesiones tienen duración configurable (default 30 min) y se invalidan al hacer logout.

7. **Configuración por .env** — Ninguna credencial está en el código. MongoDB, Django secret key, y demás variables sensibles viven en variables de entorno.

---

## PARTE 5 — Decisiones técnicas y desafíos (2-3 min)
**Expositor B**

---

> "Algunas decisiones técnicas interesantes que tomamos:"

1. **MongoDB en vez de SQL** — Las estructuras de datos son muy heteráneas (notas, calificaciones, asistencia, auditoría, configuración). MongoDB nos permite trabajar con documentos flexibles sin JOINs complejos.

2. **Rol definido por el servidor** — Cuando un usuario envía una nota, el campo "autorRol" que viene del navegador se ignora. El servidor define el rol real. Esto evita que alguien se haga pasar por admin.

3. **Firma digital con PIN** — Cada confirmación de nota o calificación firma con el PIN del alumno/responsable. El PIN se hashea igual que una contraseña. La confirmación queda registrada con fecha y gmail de quien firmó.

4. **Doble cuatrimestre** — Las calificaciones manejan 2 cuatrimestres con 7 filas cada uno, más una nota final por cuatrimestre. Esto se adapta al sistema educativo argentino.

5. **Frontend modular** — Cada vista es un componente React independiente. Si mañana queremos agregar una funcionalidad nueva, no tocamos las vistas existentes.

---

## PARTE 6 — Cierre (1 min)
**Ambos expositores**

---

**Expositor A:**
> "En resumen, el Cuaderno Digital es una solución completa que cubre la comunicación, las calificaciones, la asistencia y la administración escolar, todo en una sola plataforma con fuerte énfasis en la seguridad y la trazabilidad."

**Expositor B:**
> "La arquitectura está diseñada para ser escalable y mantenible. Los permisos por rol garantizan que cada usuario solo pueda acceder a lo que le corresponde, y el registro de auditoría permite rastrear cualquier acción."

**Expositor A:**
> "Muchas gracias por su atención. ¿Tienen alguna pregunta?"

---

## APÉNDICE — Preguntas frecuntas que pueden hacer

| Pregunta | Respuesta sugerida |
|---|---|
| ¿Por qué MongoDB y no MySQL? | Las estructuras son muy diversas: notas con firmas, asistencia con historial de cambios, configuración flexible. MongoDB se adapta sin esquemas rígidos. |
| ¿Qué pasa si un alumno borra una nota del navegador? | La nota sigue existiendo en el servidor. El frontend es solo una vista; los datos viven en MongoDB. |
| ¿Cómo se maneja la asistencia de doble turno? | El peso de una ausencia es 0.5 por turno en vez de 1, para que no se penalice doble. |
| ¿Puede un profesor ver calificaciones de otro profesor? | No. Solo puede cargar y ver calificaciones de los cursos y materias que le están asignados. |
| ¿Los backups están cifrados? | Opcionalmente. Se puede configurar una clave Fernet de cifrado en la variable de entorno BACKUP_ENCRYPTION_KEY. |
| ¿Funciona en celular? | Sí. El frontend es responsive con Tailwind CSS y tiene una barra de navegación inferior para móviles. |

---

## CHECKLIST ANTES DE LA EXPOSICIÓN

- [ ] MongoDB corriendo con datos de prueba
- [ ] Django server levantado (`py manage.py runserver`)
- [ ] React compilado (`cd frontend && npm run build`)
- [ ] Tener al menos 1 usuario de cada rol creado (Alumno, Profesor, Preceptor, Admin)
- [ ] Tener al menos 1 nota de ejemplo con PIN pendiente de confirmar
- [ ] Tener al menos 1 calificación cargada para mostrar la planilla
- [ ] Tener la vista de auditoría con algunos registros
- [ ] Tener el navegador en pantalla completa para la demo
- [ ] Probar el login de cada rol antes de la exposición
