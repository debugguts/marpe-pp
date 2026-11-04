from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class Usuario(AbstractUser):
    id_usuario = models.AutoField(primary_key=True)

    class Meta:
        db_table = "usuario"


class RegistroActividad(models.Model):
    id_actividad = models.AutoField(primary_key=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        db_column="id_usuario",
        null=True,
        blank=True,
    )
    fecha_hora = models.DateTimeField(default=timezone.now)
    operacion = models.CharField(max_length=80)
    entidad_afectada = models.CharField(max_length=100)
    referencia_registro = models.CharField(max_length=100, null=True, blank=True)
    detalle = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "registro_actividad"
        verbose_name_plural = "registros de actividad"

    def __str__(self):
        return f"{self.operacion} - {self.entidad_afectada}"