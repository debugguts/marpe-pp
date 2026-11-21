"""Pantalla Actividad: textos legibles y «Último ingreso» desde la app (corrección de UX · Usuarios)."""

from datetime import timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from apps.usuarios.actividad import detalle_legible, nombre_entidad
from apps.usuarios.models import Usuario
from config.firebase import anotar_ingreso


class DetalleLegibleTest(SimpleTestCase):
    def test_traduce_los_textos_internos(self):
        casos = [
            ("MovimientoInventario", "MERMA 0.166665 (Castaño Mediano)", "Merma · 5 huevos · Castaño mediano"),
            ("MovimientoInventario", "INGRESO_COMPRA 6.000000 (Blanco Súper)", "Ingreso por compra · 6 bandejas · Blanco súper"),
            ("MovimientoInventario", "AJUSTE_NEGATIVO 2.5 (Blanco Mediano)", "Ajuste negativo · 2,5 bandejas · Blanco mediano"),
            ("Caja", "Caja 6 (CERRADA)", "Caja cerrada"),
            ("Venta", "Venta 12 - FIADO", "Venta fiada"),
            ("Compra", "Compra 3 - 2026-11-14", "Compra del 14/11/2026"),
            ("Gasto", "Luz (12500.00)", "Luz · $ 12.500"),
            ("CuentaCorriente", "Cuenta 4 (saldo 7000.00)", "Saldo pendiente $ 7.000"),
            ("PrecioProducto", "Blanco Mediano / Bandeja: 7000.00", "Blanco Mediano / Bandeja · $ 7.000"),
        ]
        for entidad, guardado, esperado in casos:
            with self.subTest(entidad=entidad):
                self.assertEqual(detalle_legible(entidad, guardado), esperado)

    def test_lo_que_no_reconoce_queda_igual(self):
        self.assertEqual(detalle_legible("Proveedor", "Granja Los Andes"), "Granja Los Andes")
        self.assertEqual(detalle_legible("Venta", "Motivo: error de carga"), "Motivo: error de carga")

    def test_nombres_de_tablas(self):
        self.assertEqual(nombre_entidad("MovimientoInventario"), "Movimiento de inventario")
        self.assertEqual(nombre_entidad("Otra"), "Otra")


class IngresoDesdeLaAppTest(TestCase):
    def test_anota_el_ingreso_como_mucho_cada_5_minutos(self):
        usuario = Usuario.objects.create_user("lucia", password="x")
        anotar_ingreso(usuario)
        primero = Usuario.objects.get(pk=usuario.pk).last_login
        self.assertIsNotNone(primero)
        anotar_ingreso(usuario)
        self.assertEqual(Usuario.objects.get(pk=usuario.pk).last_login, primero)
        usuario.last_login = timezone.now() - timedelta(minutes=10)
        anotar_ingreso(usuario)
        self.assertGreater(Usuario.objects.get(pk=usuario.pk).last_login, primero)
