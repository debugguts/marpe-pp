"""Datos comunes para las pruebas de movimientos (Sprint 5)."""

from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group

from apps.catalogo.models import PrecioProducto, Presentacion, Producto
from apps.inventario.models import Stock
from apps.proveedores.models import CostoProveedor, Proveedor
from apps.usuarios.models import Usuario


def crear_base(prueba):
    """Deja en la prueba: operador, admin, un producto con 20 bandejas, bandeja (30 huevos) y caja (6 bandejas),
    precios de venta, un proveedor con su costo y el cliente de API ya logueado como operador."""
    prueba.operador = Usuario.objects.create_user("operador", password="x")
    prueba.admin = Usuario.objects.create_user("admin", password="x")
    prueba.admin.groups.add(Group.objects.create(name="Administrador"))

    prueba.producto = Producto.objects.create(tipo_huevo="BLANCO", tamano="MEDIANO")
    prueba.bandeja = Presentacion.objects.create(nombre="Bandeja", cantidad_bandejas_equivalentes=1)
    prueba.caja = Presentacion.objects.create(nombre="Caja", cantidad_bandejas_equivalentes=6)
    Stock.objects.create(producto=prueba.producto, cantidad_bandejas=20, stock_minimo_bandejas=5)
    for presentacion, precio in [(prueba.bandeja, "7000"), (prueba.caja, "40000")]:
        PrecioProducto.objects.create(producto=prueba.producto, presentacion=presentacion,
                                      precio=Decimal(precio), fecha_desde=date(2026, 11, 1))

    prueba.proveedor = Proveedor.objects.create(nombre="Granja Los Andes")
    CostoProveedor.objects.create(proveedor=prueba.proveedor, producto=prueba.producto,
                                  presentacion=prueba.bandeja, precio_costo=Decimal("5000"))
    prueba.client.force_login(prueba.operador)


def stock_de(producto):
    return Stock.objects.get(producto=producto).cantidad_bandejas


def entrar_como_admin(prueba):
    """Crea un administrador e inicia sesión con él (las altas de tablas base son del administrador)."""
    prueba.admin = Usuario.objects.create_user("admin", password="x")
    prueba.admin.groups.add(Group.objects.get_or_create(name="Administrador")[0])
    prueba.client.force_login(prueba.admin)
