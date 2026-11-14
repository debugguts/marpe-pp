"""Crea el primer administrador al publicar el sistema (python manage.py crear_admin_inicial).

Toma el usuario y la clave de las variables MARPE_ADMIN_USUARIO y MARPE_ADMIN_CLAVE.
Si ya existe algún usuario, no hace nada: sirve solo para el primer arranque.
"""

import os

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from apps.usuarios.models import Usuario


class Command(BaseCommand):
    help = "Crea el primer administrador (solo si la base no tiene usuarios)."

    def handle(self, *args, **opciones):
        for rol in ("Administrador", "Operador"):
            Group.objects.get_or_create(name=rol)
        usuario, clave = os.environ.get("MARPE_ADMIN_USUARIO"), os.environ.get("MARPE_ADMIN_CLAVE")
        if Usuario.objects.exists():
            self.stdout.write("Ya hay usuarios: no se crea ninguno.")
            return
        if not (usuario and clave):
            self.stdout.write(self.style.WARNING("Faltan MARPE_ADMIN_USUARIO y MARPE_ADMIN_CLAVE: no se creó el administrador."))
            return
        admin = Usuario.objects.create_superuser(username=usuario, password=clave)
        admin.groups.set([Group.objects.get(name="Administrador")])
        self.stdout.write(self.style.SUCCESS(f"Administrador «{usuario}» creado."))
