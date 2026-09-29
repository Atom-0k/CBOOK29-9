# Preguntas y Respuestas para Evaluadores — Cuaderno Digital

---

## ARQUITECTURA Y TECNOLOGÍAS

### 1. ¿Por qué eligieron MongoDB en vez de una base de datos relacional como MySQL o PostgreSQL?

**Respuesta:** Las estructuras de datos del cuaderno son muy heteráneas: una nota tiene titulo, contenido, firmas de alumnos, PINs, y un array de alumnos destinatarios. Una calificación tiene cuatrimestre, fila, firma docente y firma padre. La configuración del sistema es un documento plano. Con una BD relacional necesitaríamos muchas tablas y JOINs complejos. MongoDB nos permite trabajar con documentos flexibles: cada colección tiene su propio esquema sin forzar relaciones artificiales. Además, el acceso es mayormente lectura por gmail o curso, y MongoDB indexa eficientemente esos campos.

---

### 2. ¿Por qué usaron Django si la base de datos es MongoDB y no usan el ORM?

**Respuesta:** Django nos da cosas que no dependen del ORM: las sesiones con cookies firmadas, la protección CSRF, el sistema de URLs, los middlewares de seguridad, y la estructura de proyecto organizada. El ORM de Django lo usamos solo para las tablas internas de Django (auth, sessions, admin). Toda la lógica de negocio usa pymongo directamente sobre MongoDB. Podríamos haber usado Flask o FastAPI, pero Django ya venía con las protecciones CSRF, sesiones y headers de seguridad integradas sin tener que agregar librerías adicionales.

---

### 3. ¿Cómo se comunica el frontend con el backend?

**Respuesta:** El frontend es una SPA de React que se compila con Vite y se sirve como archivos estáticos desde Django. La comunicación con el backend es a través de una API REST: fetch con GET para lecturas y POST para escrituras, con cookies de sesión y tokens CSRF para autenticación. Cada endpoint devuelve JSON. El frontend está diseñado para funcionar tanto conectado a Django como con datos mock para desarrollo independiente.

---

### 4. ¿Por qué React y no otra librería como Vue o Angular?

**Respuesta:** React tiene un ecosistema muy maduro, es ligero, y con JSX nos permite mezclar lógica y presentación de forma clara. El sistema tiene muchas vistas condicionales (según el rol del usuario) y React maneja muy bien el estado con hooks. Con Vue habría funcionado igual, pero el equipo tenía más experiencia con React. Angular era demasiado pesado para un proyecto de esta escala.

---

### 5. ¿Cómo está estructurado el frontend?

**Respuesta:** Está organizado por carpetas:
- `features/` — cada rol tiene su propia carpeta (alumno, profesor, preceptor, admin, staff)
- `components/` — componentes compartidos (layout, formularios, ui)
- `config/` — configuración de secciones y tipos de nota
- `utils/` — helpers para CSRF y fechas

La navegación se maneja con un estado `activa` que renderiza la vista correspondiente. No usamos React Router porque la navegación está controlada por Django (solo se carga el dashboard si estás logueado).

---

### 6. ¿Qué es Tailwind CSS y por qué lo eligieron?

**Respuesta:** Tailwind es un framework CSS utility-first: en vez de escribir clases CSS personalizadas, se componen estilos con clases predefinidas directamente en el HTML/JSX. Esto nos da un diseño responsive muy rápido sin crear archivos CSS enormes. El sistema funciona en desktop (sidebar) y en móvil (bottom nav), y Tailwind facilita esa adaptación con breakpoints como `md:` para cambiar el layout según el ancho de pantalla.

---

## SEGURIDAD

### 7. ¿Qué medidas de seguridad tienen para evitar que alguien acceda a datos que no le corresponden?

**Respuesta:** Tenemos 4 capas:
1. **Autenticación** — solo usuarios logueados acceden (sesión con cookie firmada).
2. **Autorización por rol** — el backend valida en CADA endpoint qué rol necesita y a qué datos puede acceder. Un alumno solo ve sus propios datos.
3. **Asignación validada** — un profesor no solo necesita el rol, sino estar asignado a un curso/materia específico en la base de datos.
4. **Tests de seguridad** — tenemos 30 pruebas que verifican que un alumno no vea calificaciones de otro, que un profesor no acceda a cursos ajenos, etc.

---

### 8. ¿Cómo protegen contra ataques de fuerza bruta?

**Respuesta:** Tenemos rate limiting en tres capas:
- **Por IP en login** — máximo 30 intentos por hora por dirección IP.
- **Por cuenta** — 5 fallos en 15 minutos bloquean la cuenta temporalmente.
- **Por IP en PIN** — máximo 30 intentos de PIN por hora.
- **Lockout de PIN** — 5 fallos consecutivos bloquean el PIN del alumno. Solo un admin puede desbloquearlo.

Todos los contadores se almacenan en MongoDB con timestamp y se limpian automáticamente cuando expira la ventana.

---

### 9. ¿Cómo almacenan las contraseñas? ¿Se pueden recuperar si se olvidan?

**Respuesta:** Las contraseñas se hashean con bcrypt antes de guardarse. Nunca se almacenan en texto plano, ni siquiera el admin puede ver la contraseña de un usuario. Si alguien olvida su contraseña, un admin puede generar una nueva desde el panel de gestión de usuarios, que también se hashea con bcrypt. El PIN de confirmación funciona igual: se hashea y nunca se muestra en texto plano en la base de datos.

---

### 10. ¿Qué pasa si alguien intenta hacerse pasar por admin modificando el código del navegador?

**Respuesta:** El rol se define en el SERVIDOR, no en el navegador. Cuando un usuario envía una nota, el campo `autorRol` que viene del formulario se ignora completamente. El servidor busca el rol real del usuario en MongoDB y lo guarda. Incluso si alguien modifica el JavaScript del navegador para enviar `autorRol: "Admin"`, el servidor lo sobreescribe con el rol real. Esto está verificado en el test `test_crear_nota_autorrol_spoofed`.

---

### 11. ¿Qué es el sistema de firmas con PIN y cómo funciona?

**Respuesta:** Cuando un profesor o preceptor envía una nota y marca "requiere PIN", el sistema genera un campo `alumnos` con los gmails de los alumnos destinatarios. Cada alumno debe ingresar su PIN personal para firmar recepción. El PIN se hashea con bcrypt y se valida contra el hash. La firma de cada alumno se suma a un array `firmas`. La nota queda "confirmada" solo cuando TODOS los alumnos del curso han firmado. Si es una nota directa a un solo alumno, basta con que ese alumno firme.

---

### 12. ¿Qué pasa si un alumno ingresa el PIN mal 5 veces?

**Respuesta:** Su PIN se bloquea automáticamente (`pin_habilitado: false`). Aunque después ingrese el PIN correcto, el sistema lo rechaza con un 429 (Too Many Requests). Solo un administrador puede desbloquear el PIN desde el panel de Gestión de PIN, que ve cuántos alumnos tienen el PIN bloqueado y puede regenerarlo. Esto evita que alguien intente adivinar el PIN por fuerza bruta.

---

### 13. ¿Tienen pruebas automatizadas? ¿Qué cubren?

**Respuesta:** Sí, tenemos un script `test_seguridad.py` con 30 pruebas automatizadas que cubren:
- Login genérico (no revela si el usuario existe)
- Rate limiting de login y PIN
- Protección IDOR (alumno no ve calificaciones de otro)
- Permisos por rol (profesor no accede a admin, alumno no modifica horarios)
- Rol definido por servidor (anti-spoofing)
- Multiroles con permisos OR
- Creación de notas sin permiso
- Asistencia con autorización correcta
- Justificación sin auto-aprobación por alumno
- Rechazo de PIN en texto plano
- Lockout de PIN tras 5 fallos
- Política de contraseñas
- Path traversal en backups
- Sesión expirada
- TLS obligatorio en producción
- SECRET_KEY obligatoria en producción

Las pruebas corren sobre una base de datos descartable (`cuaderno_db_test`) que se crea y borra automáticamente.

---

### 14. ¿Qué headers de seguridad envían?

**Respuesta:**
- `X-Content-Type-Options: nosniff` — evita que el navegador interprete archivos como scripts.
- `Referrer-Policy: same-origin` — no envía información de referrer a sitios externos.
- `Content-Security-Policy` — configurable desde variables de entorno para restringir fuentes de scripts, estilos e imágenes.
- `CSRF` — Django genera tokens CSRF que se validan en cada POST.
- `Session Cookie HttpOnly` — la cookie de sesión no es accesible desde JavaScript.

---

### 15. ¿Cómo manejan la auditoría? ¿Qué se registra?

**Respuesta:** Cada acción relevante se registra en la colección `auditoria` de MongoDB con: fecha, usuario (gmail), acción, detalle, IP del cliente, navegador y sistema operativo. Se registra: login exitoso, login fallido, creación de notas, cambio de contraseñas, generación de PINs, asistencia guardada, etc. Los logs NUNCA contienen PINs ni contraseñas. El admin puede consultar la auditoría con filtros por usuario, acción, fecha y búsqueda de texto.

---

### 16. ¿Cómo se protege la configuración sensible?

**Respuesta:** Todas las credenciales y configuración sensible viven en variables de entorno (archivo `.env`), no en el código. Esto incluye: la clave secreta de Django, las credenciales de MongoDB, la clave de cifrado de backups, y la ruta de backups. El archivo `.env` está en `.gitignore` y nunca se sube al repositorio. En producción, si falta `DJANGO_SECRET_KEY` o si `DEBUG=False` sin HTTPS, el servidor arranca con error.

---

## BASE DE DATOS

### 17. ¿Cómo está organizada la base de datos de MongoDB?

**Respuesta:** Tenemos 10 colecciones principales:
- **usuarios** — alumnos, profesores, preceptores y admins. Campos: gmail, nombre, contraseña hasheada, rol, curso, estado, PIN hasheado, historial de estados.
- **cursos** — nombre, especialidad, año lectivo, activo/inactivo.
- **asignaciones** — vincula usuarios con cursos y materias. Una asignación SIN materia es de preceptor; CON materia es de profesor.
- **notas** — comunicados, amonestaciones, citaciones, felicitaciones. Con campos de firmas, PIN, y confirmación.
- **calificaciones** — planilla por alumno, materia, cuatrimestre y fila.
- **horarios** — horario semanal por curso.
- **asistencias** — registros institucionales y por materia, con justificaciones e historial de cambios.
- **auditoria** — logs de todas las acciones.
- **config** — configuración institucional.
- **intentos_login** — contadores de rate limiting.
- **backups** — metadatos de backups realizados.

---

### 18. ¿Cómo calculan las inasistencias? ¿Por qué usan Decimal y no float?

**Respuesta:** Usamos `Decimal` de Python porque los floats tienen errores de redondeo (0.1 + 0.2 ≠ 0.3). Las inasistencias se calculan así:
- **Presente** = 0 faltas
- **Tarde ≤ tolerancia (20 min)** = 0.25 falta
- **Tarde > tolerancia** = ausente completa
- **Ausente con un turno** = 1 falta
- **Ausente con doble turno/contraturno** = 0.5 falta por turno

El porcentaje de asistencia por materia se calcula con aritmética entera (`asistidas * 100 >= minimo * dictadas`) para evitar dependencia de floats. El estado se clasifica en: cumple (≥ min+5%), cerca (entre min y min+5%), no_cumple (< min%).

---

### 19. ¿Qué es el sistema de doble cuatrimestre en calificaciones?

**Respuesta:** Las calificaciones se organizan en 2 cuatrimestres, cada uno con 7 filas para cargar evaluaciones (fecha + detalle). Además hay una nota final por cuatrimestre. La planilla se renderiza como una tabla: filas = evaluaciones, columnas = cuatrimestres. El profesor carga fecha, detalle y su firma (generada automáticamente por el servidor). El alumno o responsable firma con PIN. Cuando ambos han firmado, la fila queda completa.

---

### 20. ¿Cómo funciona el backup y restauración?

**Respuesta:** El backup volca TODAS las colecciones a un archivo JSON con todos los documentos. Opcionalmente se cifra con Fernet si se define `BACKUP_ENCRYPTION_KEY`. Los archivos se guardan fuera del repositorio en un directorio configurable. La restauración lee el JSON, borra todos los datos de cada colección y reinserta los documentos. Hay protección contra path traversal: no se puede restaurar un archivo fuera del directorio de backups. Cada backup queda registrado en la colección `backups` con nombre, fecha, tamaño y quién lo creó.

---

## FUNCIONALIDADES

### 21. ¿Cómo manejan los usuarios con múltiples roles?

**Respuesta:** Un usuario puede tener un rol simple ("Profesor") o una lista de roles (["Profesor", "Preceptor"]). El sistema arma un menú combinando las funcionalidades de ambos roles sin duplicar secciones. Los permisos se evalúan con OR: si tiene alguno de los roles requeridos, tiene acceso. Por ejemplo, un usuario profesor+preceptor puede cargar calificaciones (como profesor) Y asistencia institucional (como preceptor) y editar horarios (como preceptor). Cada permiso se valida por separado con las asignaciones reales.

---

### 22. ¿Cómo funciona el sistema de justificaciones de inasistencia?

**Respuesta:** Un alumno puede solicitar una justificación ingresando: fecha de inasistencia, motivo, tipo (certificado, parte médico, etc.) y opcionalmente un certificado. Si el solicitante es un alumno (no admin ni preceptor), la justificación se guarda como "Pendiente" y el certificado se descarta — el alumno no puede auto-aprobarse. Solo un admin o preceptor del curso puede aprobar la justificación. Si no existe registro de asistencia para esa fecha, se crea uno con estado "Ausente" y la justificación adjunta.

---

### 23. ¿Pueden los alumnos ver datos de otros alumnos?

**Respuesta:** No. Un alumno puro solo ve: su propio registro de alumnos (en la lista de alumnos de su curso), sus propias notas, sus propias calificaciones y su propia asistencia. Si intenta acceder a los datos de otro alumno, el backend devuelve 403 Forbidden. Esto está verificado en el test `test_idor_calificaciones` y `test_asistencia_alumno_idor`. Un alumno tampoco puede crear notas ni modificar horarios.

---

### 24. ¿Cómo funciona el rol de preceptor vs profesor?

**Respuesta:** El **preceptor** es el responsable directo de un curso: carga la asistencia institucional (diaria por turno), edita el horario del curso, y puede enviar notas. El **profesor** dicta materias específicas en cursos específicos: carga calificaciones y asistencia por materia. La diferencia clave es que el preceptor ve TODO el curso, mientras que el profesor solo ve su materia. Un usuario puede tener ambos roles, y el sistema combina los permisos.

---

### 25. ¿Qué pasa si un curso se da de baja o un alumno se gradúa?

**Respuesta:** Los cursos se pueden desactivar (no se eliminan, solo se marca `activo: false`). Los alumnos se pueden dar de baja con un motivo obligatorio. Un alumno de baja no aparece en las listas normales de asistencia ni puede loguearse. El admin puede reactivar usuarios en cualquier momento. Cada cambio de estado queda registrado en el historial del usuario con fecha, admin que lo hizo y motivo.

---

## DESARROLLO Y MANTENIMIENTO

### 26. ¿Cómo desplegarían esto en producción?

**Respuesta:** Los pasos serían:
1. Configurar un servidor con Python y MongoDB.
2. Crear el usuario dedicado de MongoDB con permisos solo sobre `cuaderno_db`.
3. Generar y configurar `.env` con `DJANGO_DEBUG=False`, HTTPS=True, SECRET_KEY segura, TLS de MongoDB.
4. Compilar el frontend (`npm run build` en `/frontend`).
5. Servir con Gunicorn (ASGI/WSGI) detrás de un reverse proxy (Nginx) con TLS.
6. Los archivos estáticos se sirven desde Nginx o whitenoise.
7. MongoDB con replica set y TLS para producción.

---

### 27. ¿Cómo se escalara si la escuela tiene 1000+ alumnos?

**Respuesta:** MongoDB escala horizontalmente con sharding. El backend de Django se puede escalar con más instancias detrás de un load balancer. Las sesiones usan cookies firmadas (sin estado en servidor), así que no hay problema con múltiples instancias. Los endpoints son stateless. Para optimizar, se agregarían índices en MongoDB sobre campos consultados frecuentemente (gmail, curso, materia, fecha).

---

### 28. ¿Por qué no usaron Django REST Framework?

**Respuesta:** Para este proyecto, los endpoints son suficientemente simples como para justificar un framework completo de API. Cada endpoint es una función que recibe el request, valida, consulta MongoDB y devuelve un JsonResponse. DRF nos habría dado serializers, viewsets y paginación, pero también habría agregado complejidad innecesaria. Con las funciones plain y JsonResponse, el código es más directo y fácil de entender.

---

### 29. ¿Cómo manejan la configuración del año lectivo y los parámetros institucionales?

**Respuesta:** Todo está en la colección `config` de MongoDB, accesible desde el panel de Admin > Configuración. Parámetros como: duración de sesión, límite de inasistencias (default 28), porcentaje mínimo de asistencia (default 75%), tolerancia de tardanza (default 20 min), largo de PIN, etc. Si no hay configuración, se usan valores por defecto hardcodeados. El admin puede modificar estos valores desde la interfaz.

---

### 30. ¿Qué mejorarían a futuro?

**Respuestas posibles:**
- **Notificaciones push** — alertas en tiempo real cuando se recibe una nota.
- **Exportar a PDF** — generar la planilla de calificaciones o el boletín en PDF.
- **Firma digital con certificado** — en vez de solo PIN, usar certificados digitales para firmas con validez legal.
- **App móvil nativa** — o al menos PWA para mejor experiencia en celular.
- **Consultas de MongoDB con índices** — optimizar queries con índices compuestos para escalabilidad.
- **CI/CD** — pipeline automático de tests y despliegue.
- **Multitenancy** — soportar múltiples escuelas en una misma instancia.
