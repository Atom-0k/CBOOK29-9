"""
Django settings for config project.

Configuración segura por variables de entorno (ver .env.example).
Ninguna credencial se hardcodea acá.
"""

from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from . import db, env

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.env_bool("DJANGO_DEBUG", True)

# SECURITY WARNING: keep the secret key used in production secret!
# Debe estar en el entorno (DJANGO_SECRET_KEY).
#  * Desarrollo: si falta, se genera una aleatoria en runtime (invalida
#    sesiones al reiniciar) — aceptable solo con DEBUG=True.
#  * Producción: si falta, el arranque FALLA (fail secure).
SECRET_KEY = env.env("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        import logging
        import secrets

        logging.getLogger(__name__).warning(
            "DJANGO_SECRET_KEY no definida: usando clave aleatoria de desarrollo. "
            "Definila en .env o el entorno de producción."
        )
        SECRET_KEY = secrets.token_hex(64)
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY es OBLIGATORIA en producción. "
            "Generala con: python -c \"import secrets; print(secrets.token_hex(64))\" "
            "y definila en el entorno (nunca en el código)."
        )

ALLOWED_HOSTS = env.env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])
if not DEBUG:
    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "DJANGO_ALLOWED_HOSTS no puede estar vacío en producción."
        )
    if "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured(
            "DJANGO_ALLOWED_HOSTS no puede contener '*' en producción."
        )

# HTTPS / cookies seguras (activar en producción con HTTPS=True)
HTTPS = env.env_bool("HTTPS", False)
if not DEBUG and not HTTPS:
    raise ImproperlyConfigured(
        "En producción HTTPS debe estar habilitado (HTTPS=True). "
        "Sirve la app por un reverse proxy con TLS y fijá SECURE_PROXY_SSL_HEADER."
    )
SECURE_SSL_REDIRECT = env.env_bool("SECURE_SSL_REDIRECT", False)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = HTTPS
CSRF_COOKIE_SECURE = HTTPS
SECURE_HSTS_SECONDS = env.env_int("SECURE_HSTS_SECONDS", 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env.env_bool("SECURE_HSTS_PRELOAD", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CONTENT_SECURITY_POLICY = env.env("SECURE_CSP", "")

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Tu aplicación aquí abajo:
    'cuaderno',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'config.middleware.ApiErrorMiddleware',
    'config.middleware.SecurityHeadersMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'config.middleware.SesionExpiraMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)

STATIC_URL = 'static/'
STATICFILES_DIRS = [
    BASE_DIR / "static",
]


# Sesiones
# Se mantiene signed_cookies (sin estado en servidor). La clave firma es
# SECRET_KEY (rotada vía entorno). La expiración activa se controla con
# SesionExpiraMiddleware + duracion_sesion_min de la config institucional.
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
# La sesión va en la cookie, así que sólo se vuelve a emitir cuando la sesión
# se MODIFICA. Sin esto el navegador borraba la cookie a los 30 min aunque la
# persona siguiera usando la app: la SPA seguía mostrando lo ya cargado y el
# primer request nuevo (descargar un PDF, abrir el detalle) volvía 401.
# Con esto la cookie se renueva en cada request: ventana deslizante real.
SESSION_SAVE_EVERY_REQUEST = True
# El tope real de inactividad lo aplica SesionExpiraMiddleware; este valor
# tiene que ser holgado para no cortar antes a quien está trabajando.
SESSION_COOKIE_AGE = env.env_int("SESSION_COOKIE_AGE", 28800)
CSRF_COOKIE_SAMESITE = 'Lax'

# ---------------------------------------------------------------------------
# Envío de correos (avisos de inasistencia)
#
# El backend por defecto escribe los mensajes en un archivo en vez de
# enviarlos: así el sistema nunca pierde un aviso ni depende de que el
# servidor de correo esté configurado. Para enviar de verdad hay que poner
# EMAIL_BACKEND=smtp y completar EMAIL_HOST / EMAIL_HOST_USER / EMAIL_PASSWORD.
#
# OJO: con la contraseña de aplicación de Gmail hay que generar una clave
# específica. La contraseña de la cuenta no sirve.
# ---------------------------------------------------------------------------
EMAIL_BACKEND = env.env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env.env("EMAIL_HOST", "")
EMAIL_PORT = env.env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = env.env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env.env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env.env_bool("EMAIL_USE_TLS", True)
EMAIL_USE_SSL = env.env_bool("EMAIL_USE_SSL", False)
EMAIL_TIMEOUT = env.env_int("EMAIL_TIMEOUT", 20)
# Si no se define remitente, cada aviso usa el nombre de la escuela y cae en
# EMAIL_HOST_USER (ver notificaciones.py).
EMAIL_DEFAULT_FROM_EMAIL = env.env("EMAIL_DEFAULT_FROM_EMAIL", "")

# Logging (archivos fuera del repo cuando LOG_DIR esté definido)
LOG_DIR = env.env("LOG_DIR")
if LOG_DIR:
    LOG_DIR = Path(LOG_DIR)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "simple": {"format": "{asctime} {levelname} {name}: {message}", "style": "{"},
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "simple"},
            "app_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(LOG_DIR / "app.log"),
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 3,
                "formatter": "simple",
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(LOG_DIR / "errors.log"),
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 3,
                "formatter": "simple",
            },
        },
        "root": {"handlers": ["console", "app_file"], "level": "INFO"},
        "loggers": {
            "django.request": {"handlers": ["error_file"], "level": "WARNING", "propagate": False},
            "cuaderno": {"handlers": ["console", "app_file"], "level": "INFO", "propagate": False},
        },
    }
