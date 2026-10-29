"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect  # ← AGREGÁ ESTA LÍNEA
from cuaderno.views import login_view, dashboard_view
from cuaderno import views
from cuaderno import admin_views
from cuaderno import asistencia_views
from cuaderno import notas_respuesta

urlpatterns = [
    path('', lambda request: redirect('login')),
    path('admin/', admin.site.urls),
    path('login/', login_view, name='login'),
    path('dashboard/', dashboard_view, name='dashboard'),
    path('logout/', views.logout_view, name='logout'),
    path('api/alumnos/', views.api_alumnos_por_curso, name='api_alumnos'),
    path('api/notas/crear/', views.api_crear_nota, name='api_crear_nota'),
    path('api/notas/editar/', views.api_editar_nota, name='api_editar_nota'),
    path('api/notas/mensaje/', notas_respuesta.api_responder_nota, name='api_responder_nota'),
    path('api/notas/mensajes/', notas_respuesta.api_mensajes_nota, name='api_mensajes_nota'),
    path('api/notas/mensaje/responder/', notas_respuesta.api_responder_mensaje, name='api_responder_mensaje'),
    path('api/cursos/', views.api_cursos, name='api_cursos'),
    path('api/horarios/', views.api_horario_curso, name='api_horario'),
    path('api/horarios/guardar/', views.api_guardar_horario, name='api_guardar_horario'),
    path('api/materias-por-curso/', views.api_materias_por_curso, name='api_materias_por_curso'),
    path('api/calificaciones/', views.api_calificaciones_alumno, name='api_calificaciones'),
    path('api/calificaciones/guardar/', views.api_guardar_calificacion, name='api_guardar_calificacion'),
    path('api/calificaciones/final/', views.api_guardar_nota_final, name='api_guardar_nota_final'),
    path('api/calificaciones/firmar/', views.api_firmar_calificacion, name='api_firmar_calificacion'),
    path('api/calificaciones/eliminar/', views.api_eliminar_calificacion, name='api_eliminar_calificacion'),
    path('api/cambiar-contrasena/', views.api_cambiar_contrasena, name='api_cambiar_contrasena'),
    path('api/notas/confirmar/', views.api_confirmar_nota, name='api_confirmar_nota'),
    path('api/notas/enviadas/', views.api_notas_enviadas, name='api_notas_enviadas'),
    path('api/admin/dashboard/', admin_views.api_admin_dashboard, name='api_admin_dashboard'),
    path('api/admin/usuarios/', admin_views.api_admin_usuarios, name='api_admin_usuarios'),
    path('api/admin/usuarios/crear/', admin_views.api_admin_usuarios_crear, name='api_admin_usuarios_crear'),
    path('api/admin/usuarios/editar/', admin_views.api_admin_usuarios_editar, name='api_admin_usuarios_editar'),
    path('api/admin/usuarios/accion/', admin_views.api_admin_usuarios_accion, name='api_admin_usuarios_accion'),
    path('api/admin/cursos/', admin_views.api_admin_cursos, name='api_admin_cursos'),
    path('api/admin/cursos/guardar/', admin_views.api_admin_cursos_guardar, name='api_admin_cursos_guardar'),
    path('api/admin/cursos/accion/', admin_views.api_admin_cursos_accion, name='api_admin_cursos_accion'),
    path('api/admin/cursos/detalle/', admin_views.api_admin_curso_detalle, name='api_admin_curso_detalle'),
    path('api/admin/materias/', admin_views.api_admin_materias, name='api_admin_materias'),
    path('api/admin/materias/guardar/', admin_views.api_admin_materias_guardar, name='api_admin_materias_guardar'),
    path('api/admin/comunicados/', admin_views.api_admin_comunicados, name='api_admin_comunicados'),
    path('api/admin/comunicados/accion/', admin_views.api_admin_comunicados_accion, name='api_admin_comunicados_accion'),
    path('api/admin/confirmaciones/', admin_views.api_admin_confirmaciones, name='api_admin_confirmaciones'),
    path('api/admin/pin/', admin_views.api_admin_pin, name='api_admin_pin'),
    path('api/admin/pin/accion/', admin_views.api_admin_pin_accion, name='api_admin_pin_accion'),
    path('api/admin/auditoria/', admin_views.api_admin_auditoria, name='api_admin_auditoria'),
    path('api/admin/backups/', admin_views.api_admin_backups, name='api_admin_backups'),
    path('api/admin/backups/crear/', admin_views.api_admin_backups_crear, name='api_admin_backups_crear'),
    path('api/admin/backups/restaurar/', admin_views.api_admin_backups_restaurar, name='api_admin_backups_restaurar'),
    path('api/admin/backups/descargar/', admin_views.api_admin_backups_descargar, name='api_admin_backups_descargar'),
    path('api/admin/config/', admin_views.api_admin_config, name='api_admin_config'),
    path('api/admin/config/guardar/', admin_views.api_admin_config_guardar, name='api_admin_config_guardar'),
    path('api/asistencia/config/', asistencia_views.api_asistencia_config, name='api_asistencia_config'),
    path('api/asistencia/alumno/', asistencia_views.api_asistencia_alumno, name='api_asistencia_alumno'),
    path('api/asistencia/preceptor/', asistencia_views.api_asistencia_preceptor, name='api_asistencia_preceptor'),
    path('api/asistencia/preceptor/guardar/', asistencia_views.api_asistencia_preceptor_guardar, name='api_asistencia_preceptor_guardar'),
    path('api/asistencia/profesor/', asistencia_views.api_asistencia_profesor, name='api_asistencia_profesor'),
    path('api/asistencia/profesor/guardar/', asistencia_views.api_asistencia_profesor_guardar, name='api_asistencia_profesor_guardar'),
    path('api/asistencia/justificar/', asistencia_views.api_asistencia_justificar, name='api_asistencia_justificar'),
    path('api/asistencia/actas/', asistencia_views.api_actas_lista, name='api_actas_lista'),
    path('api/asistencia/actas/detalle/', asistencia_views.api_actas_detalle, name='api_actas_detalle'),
    path('api/asistencia/actas/pdf/', asistencia_views.api_actas_pdf, name='api_actas_pdf'),
]