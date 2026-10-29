from django.db import models

from django.db import models

class Usuario(models.Model):
    gmail = models.CharField(max_length=100, db_column='Gmail', primary_key=True)
    contrasena = models.CharField(max_length=100, db_column='Contraseña')
    apellido = models.CharField(max_length=100, db_column='Apellido', blank=True)
    nombres = models.CharField(max_length=100, db_column='Nombres', blank=True)
    curso = models.CharField(max_length=20, db_column='Curso', blank=True)
    rol = models.CharField(max_length=50, db_column='Rol', blank=True)

    class Meta:
        managed = False
        db_table = 'usuarios'

    def __str__(self):
        return self.gmail