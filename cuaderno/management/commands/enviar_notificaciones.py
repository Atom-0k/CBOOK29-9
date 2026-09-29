"""Envía los avisos de inasistencia que quedaron en la cola.

Los avisos se encolan al tomar la lista (ver `cuaderno.notificaciones`) y se
envían aparte con este comando, para que una caída del servidor de correo
nunca pueda impedir guardar la asistencia.

Uso:
    python manage.py enviar_notificaciones
    python manage.py enviar_notificaciones --limite 200
    python manage.py enviar_notificaciones --ver-cola
    python manage.py enviar_notificaciones --reintentar-fallidos
    python manage.py enviar_notificaciones --dry-run

Se puede agendar con el Programador de tareas de Windows (o cron) para que
corra cada pocos minutos.
"""
from datetime import datetime

from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand

from cuaderno.auth import _mongo_db
from cuaderno.notificaciones import COLECCION, MAX_INTENTOS


class Command(BaseCommand):
    help = "Envía a la cola de salida los avisos de inasistencia pendientes."

    def add_arguments(self, parser):
        parser.add_argument("--limite", type=int, default=100,
                            help="Máximo de avisos a procesar en esta corrida (por defecto 100).")
        parser.add_argument("--dry-run", action="store_true",
                            help="Muestra qué se enviaría sin enviar nada.")
        parser.add_argument("--ver-cola", action="store_true",
                            help="Muestra el estado de la cola y termina.")
        parser.add_argument("--reintentar-fallidos", action="store_true",
                            help="Reintenta también los avisos que ya fallaron y que no "
                                 "agotaron sus intentos.")

    def handle(self, *args, **options):
        if options["ver_cola"]:
            self._ver_cola()
            return

        limite = max(1, min(1000, options["limite"]))
        estados = ["pendiente"]
        if options["reintentar_fallidos"]:
            estados.append("fallido")

        cursor = _mongo_db[COLECCION].find(
            {"estadoEnvio": {"$in": estados}, "intentos": {"$lt": MAX_INTENTOS}}
        ).sort("creado", 1).limit(limite)

        enviados = fallos = omitidos = 0
        total = 0
        for aviso in cursor:
            total += 1
            if options["dry_run"]:
                self.stdout.write(
                    f"[dry-run] {aviso.get('para')} · {aviso.get('asunto')}"
                )
                omitidos += 1
                continue
            if self._enviar(aviso):
                enviados += 1
            else:
                fallos += 1

        if total == 0:
            self.stdout.write("No hay avisos pendientes.")
            return
        if options["dry_run"]:
            self.stdout.write(self.style.WARNING(f"{total} avisos pendientes (no se envió nada)."))
            return
        self.stdout.write(self.style.SUCCESS(
            f"Procesados {total}: {enviados} enviados, {fallos} con error."
        ))

    def _enviar(self, aviso):
        """Intenta enviar un aviso y deja registrado el resultado."""
        clave = aviso.get("clave")
        ahora = datetime.now().isoformat()
        intentos = int(aviso.get("intentos") or 0) + 1
        try:
            EmailMessage(
                subject=aviso.get("asunto") or "Aviso de inasistencia",
                body=aviso.get("cuerpo") or "",
                from_email=aviso.get("remitente") or None,
                to=[aviso.get("para")],
                connection=None,
            ).send(fail_silently=False)
        except Exception as exc:
            agotado = intentos >= MAX_INTENTOS
            _mongo_db[COLECCION].update_one({"clave": clave}, {"$set": {
                "estadoEnvio": "fallido" if agotado else "pendiente",
                "intentos": intentos,
                "error": str(exc)[:500],
                "ultimoIntento": ahora,
            }})
            etiqueta = "descartado" if agotado else "se reintentará"
            self.stderr.write(self.style.WARNING(
                f"  ✗ {aviso.get('para')}: {exc} ({etiqueta})"
            ))
            return False

        _mongo_db[COLECCION].update_one({"clave": clave}, {"$set": {
            "estadoEnvio": "enviado",
            "intentos": intentos,
            "enviado": ahora,
            "error": "",
            "ultimoIntento": ahora,
        }})
        self.stdout.write(f"  ✓ {aviso.get('para')} · {aviso.get('asunto')}")
        return True

    def _ver_cola(self):
        for estado in ("pendiente", "enviado", "fallido"):
            total = _mongo_db[COLECCION].count_documents({"estadoEnvio": estado})
            self.stdout.write(f"{estado:>10}: {total}")
        proximos = _mongo_db[COLECCION].find(
            {"estadoEnvio": "pendiente"}
        ).sort("creado", 1).limit(10)
        if not list(proximos):
            return
        self.stdout.write("")
        self.stdout.write("Próximos a enviar:")
        for a in proximos:
            self.stdout.write(f"  {a.get('creado', '')[:16]}  {a.get('para')}  {a.get('asunto')}")
