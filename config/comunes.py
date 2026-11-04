from django.db import models


class Estado(models.TextChoices):
    ACTIVO = "ACTIVO", "Activo"
    INACTIVO = "INACTIVO", "Inactivo"
    

class MedioPago(models.TextChoices):
    EFECTIVO = "EFECTIVO", "Efectivo"
    TRANSFERENCIA = "TRANSFERENCIA", "Transferencia"