from django.db import migrations


def crear_consumidor_final(apps, schema_editor):
    Cliente = apps.get_model("clientes", "Cliente")
    cliente, _ = Cliente.objects.get_or_create(
        nombre="Consumidor final", defaults={"estado": "ACTIVO"}
    )
    if cliente.pk != 1:
        raise RuntimeError("'Consumidor final' debe tener id_cliente = 1.")


class Migration(migrations.Migration):
    dependencies = [("clientes", "0001_initial")]

    operations = [
        migrations.RunPython(crear_consumidor_final, migrations.RunPython.noop),
    ]
