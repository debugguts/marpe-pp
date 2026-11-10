from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.caja.models import Caja, MovimientoCaja
from apps.catalogo.models import PrecioProducto, Presentacion, Producto
from apps.clientes.models import CONSUMIDOR_FINAL_ID, Cliente
from apps.compras.models import Compra, DetalleCompra, DetalleCompraMovimiento
from apps.gastos.models import Gasto, GastoMovCaja
from apps.inventario.models import MovimientoInventario, Stock
from apps.proveedores.models import Proveedor
from apps.usuarios.models import RegistroActividad, Usuario
from apps.ventas.models import (
    CuentaCorriente,
    DetalleVenta,
    DetalleVentaMovimiento,
    PagoCuenta,
    PagoCuentaMovCaja,
    PagoVenta,
    PagoVentaMovCaja,
    Venta,
)

# (tipo, tamaño, stock en bandejas, stock mínimo, factor de precio)
PRODUCTOS = [
    ("BLANCO", "MEDIANO", "25", "10", "1.00"),
    ("BLANCO", "SELECCIÓN", "6", "10", "1.10"),
    ("CASTAÑO", "MEDIANO", "40", "10", "1.05"),
    ("CASTAÑO", "SÚPER", "3", "8", "1.20"),
]
PRESENTACIONES = [
    ("Unidad", "0.033333", 250),
    ("Maple", "1", 7000),
    ("Cajón", "12", 80000),
]


class Command(BaseCommand):
    help = "Carga datos de prueba (solo desarrollo). Se puede repetir sin duplicar."

    @transaction.atomic
    def handle(self, *args, **options):
        self.cargar_usuarios()
        self.cargar_proveedores_y_clientes()
        self.cargar_catalogo_y_stock()
        self.cargar_operaciones()
        self.stdout.write(self.style.SUCCESS("Datos de prueba cargados."))

    def cargar_usuarios(self):
        admin_g, _ = Group.objects.get_or_create(name="Administrador")
        oper_g, _ = Group.objects.get_or_create(name="Operador")
        operador, creado = Usuario.objects.get_or_create(
            username="operador", defaults={"is_staff": True}
        )
        if creado:
            operador.set_password("marpe1234")
            operador.save()
        operador.groups.add(oper_g)
        admin = Usuario.objects.filter(username="admin").first()
        if admin:
            admin.groups.add(admin_g)

    def cargar_proveedores_y_clientes(self):
        for nombre, tel in [("Granja Los Andes", "387-4001001"),
                            ("Avícola del Valle", "387-4002002"),
                            ("Huevos San Cayetano", "387-4003003")]:
            Proveedor.objects.get_or_create(nombre=nombre, defaults={"telefono": tel})
        for nombre, tel in [("María Gómez", "387-5001001"),
                            ("Almacén Don Pepe", "387-5002002"),
                            ("Panadería La Espiga", "387-5003003"),
                            ("Rosa Aguirre", "387-5004004")]:
            Cliente.objects.get_or_create(nombre=nombre, defaults={"telefono": tel})

    def cargar_catalogo_y_stock(self):
        presentaciones = []
        for nombre, equiv, base in PRESENTACIONES:
            p, _ = Presentacion.objects.get_or_create(
                nombre=nombre,
                defaults={"cantidad_bandejas_equivalentes": Decimal(equiv)},
            )
            presentaciones.append((p, base))
        for tipo, tamano, stock, minimo, factor in PRODUCTOS:
            prod, _ = Producto.objects.get_or_create(tipo_huevo=tipo, tamano=tamano)
            Stock.objects.get_or_create(
                producto=prod,
                defaults={
                    "cantidad_bandejas": Decimal(stock),
                    "stock_minimo_bandejas": Decimal(minimo),
                },
            )
            for pres, base in presentaciones:
                PrecioProducto.objects.get_or_create(
                    producto=prod,
                    presentacion=pres,
                    fecha_hasta=None,
                    defaults={
                        "precio": (Decimal(base) * Decimal(factor)).quantize(Decimal("0.01")),
                        "fecha_desde": date(2026, 10, 1),
                    },
                )
    def cargar_operaciones(self):
        if Compra.objects.exists():
            self.stdout.write("Operaciones ya cargadas; se omiten.")
            return
        oper = Usuario.objects.get(username="operador")
        admin = Usuario.objects.filter(username="admin").first() or oper
        ahora = timezone.now()
        prod = {(p.tipo_huevo, p.tamano): p for p in Producto.objects.all()}
        pres = {p.nombre: p for p in Presentacion.objects.all()}
        bl_med, bl_sel = prod[("BLANCO", "MEDIANO")], prod[("BLANCO", "SELECCIÓN")]
        c_med, c_sup = prod[("CASTAÑO", "MEDIANO")], prod[("CASTAÑO", "SÚPER")]
        maple, cajon = pres["Maple"], pres["Cajón"]

        def mov(producto, tipo, cantidad, motivo=None):
            return MovimientoInventario.objects.create(
                producto=producto, usuario=oper, tipo_movimiento=tipo,
                cantidad_bandejas=Decimal(cantidad), motivo=motivo,
            )

        def movcaja(caja, tipo, importe, motivo=None, fecha=None):
            return MovimientoCaja.objects.create(
                caja=caja, usuario=oper, tipo_movimiento=tipo,
                importe=Decimal(importe), motivo=motivo,
                fecha_hora=fecha or timezone.now(),
            )

        # Compra: 93 maples = stock final esperado + lo vendido/mermado
        compra = Compra.objects.create(
            fecha=ahora.date(), total=Decimal("465000"), usuario=oper,
            proveedor=Proveedor.objects.get(nombre="Granja Los Andes"),
        )
        for p, maples in [(bl_med, 28), (bl_sel, 9), (c_med, 52), (c_sup, 4)]:
            det = DetalleCompra.objects.create(
                compra=compra, producto=p, presentacion=maple,
                cantidad=Decimal(maples), precio_unitario=Decimal("5000"),
                subtotal=Decimal(maples * 5000),
            )
            DetalleCompraMovimiento.objects.create(
                detalle_compra=det,
                movimiento_inventario=mov(
                    p, "INGRESO_COMPRA", Decimal(maples) * maple.cantidad_bandejas_equivalentes
                ),
            )

        # Caja de ayer (cerrada): 20000 + 5000 - 3000 = 22000
        ayer = ahora - timedelta(days=1)
        caja_ant = Caja.objects.create(
            fecha_hora_apertura=ayer - timedelta(hours=9), saldo_inicial=Decimal("20000"),
            usuario_apertura=oper, fecha_hora_cierre=ayer, efectivo_contado=Decimal("22000"),
            saldo_esperado=Decimal("22000"), diferencia=Decimal("0"),
            usuario_cierre=admin, estado="CERRADA",
        )
        movcaja(caja_ant, "INGRESO_MANUAL", "5000", "Cambio aportado", ayer - timedelta(hours=8))
        movcaja(caja_ant, "RETIRO", "3000", "Retiro al banco", ayer - timedelta(hours=1))

        # Caja de hoy (abierta)
        caja = Caja.objects.create(
            fecha_hora_apertura=ahora - timedelta(hours=4),
            saldo_inicial=Decimal("15000"), usuario_apertura=oper,
        )

        def crear_venta(cliente, modalidad, items):
            venta = Venta.objects.create(
                modalidad=modalidad, total=Decimal("0"), cliente=cliente, usuario=oper
            )
            total = Decimal("0")
            for producto, presentacion, cant in items:
                precio = PrecioProducto.objects.get(
                    producto=producto, presentacion=presentacion, fecha_hasta=None
                ).precio
                subtotal = (Decimal(cant) * precio).quantize(Decimal("0.01"))
                det = DetalleVenta.objects.create(
                    venta=venta, producto=producto, presentacion=presentacion,
                    cantidad=Decimal(cant), precio_unitario_aplicado=precio,
                    subtotal=subtotal,
                )
                DetalleVentaMovimiento.objects.create(
                    detalle_venta=det,
                    movimiento_inventario=mov(
                        producto, "EGRESO_VENTA",
                        Decimal(cant) * presentacion.cantidad_bandejas_equivalentes,
                    ),
                )
                total += subtotal
            venta.total = total
            venta.save(update_fields=["total"])
            return venta

        def pagar(venta, medio, importe, ref=None):
            pago = PagoVenta.objects.create(
                venta=venta, medio_pago=medio, importe=Decimal(importe),
                referencia_transferencia=ref,
            )
            if medio == "EFECTIVO":
                PagoVentaMovCaja.objects.create(
                    pago_venta=pago,
                    movimiento_caja=movcaja(caja, "VENTA_EFECTIVO", importe),
                )

        consumidor = Cliente.objects.get(pk=CONSUMIDOR_FINAL_ID)
        maria = Cliente.objects.get(nombre="María Gómez")
        pepe = Cliente.objects.get(nombre="Almacén Don Pepe")

        v1 = crear_venta(consumidor, "CONTADO", [(bl_med, maple, 2)])
        pagar(v1, "EFECTIVO", "14000")

        v2 = crear_venta(maria, "CONTADO", [(c_med, cajon, 1)])
        pagar(v2, "EFECTIVO", "50000")
        pagar(v2, "TRANSFERENCIA", "34000", "TRF-0001")

        v3 = crear_venta(pepe, "FIADO", [(bl_sel, maple, 3)])
        cuenta = CuentaCorriente.objects.create(
            venta=v3, importe_original=v3.total, saldo_pendiente=v3.total
        )
        cobro = PagoCuenta.objects.create(
            cuenta=cuenta, importe=Decimal("10000"), medio_pago="EFECTIVO"
        )
        PagoCuentaMovCaja.objects.create(
            pago_cuenta=cobro,
            movimiento_caja=movcaja(caja, "COBRO_DEUDA_EFECTIVO", "10000"),
        )
        cuenta.saldo_pendiente = v3.total - Decimal("10000")
        cuenta.save(update_fields=["saldo_pendiente"])

        v4 = crear_venta(consumidor, "CONTADO", [(c_sup, maple, 1)])
        pagar(v4, "TRANSFERENCIA", "8400", "TRF-0002")

        # Merma
        mov(bl_med, "MERMA", "1", "Huevos rotos en transporte")

        # Gastos
        g1 = Gasto.objects.create(
            fecha=ahora.date(), concepto="Bolsas y bandejas", categoria="Insumos",
            importe=Decimal("4500"), medio_pago="EFECTIVO", usuario=oper,
        )
        GastoMovCaja.objects.create(
            gasto=g1, movimiento_caja=movcaja(caja, "GASTO_EFECTIVO", "4500")
        )
        Gasto.objects.create(
            fecha=ahora.date(), concepto="Servicio de luz", categoria="Servicios",
            importe=Decimal("12000"), medio_pago="TRANSFERENCIA", usuario=oper,
        )
        # Gastos fijos del mes: se usan para el precio sugerido (HU-09-E)
        for concepto, categoria, importe in [("Alquiler del local", "Alquiler", "150000"),
                                             ("Combustible del reparto", "Combustible", "60000")]:
            Gasto.objects.create(
                fecha=ahora.date(), concepto=concepto, categoria=categoria, tipo="FIJO",
                importe=Decimal(importe), medio_pago="TRANSFERENCIA", usuario=oper,
            )

        # Auditoría
        for op, ent, ref in [("Alta", "Compra", compra.pk), ("Alta", "Venta", v1.pk),
                             ("Alta", "Venta", v3.pk), ("Apertura", "Caja", caja.pk)]:
            RegistroActividad.objects.create(
                usuario=oper, operacion=op, entidad_afectada=ent, referencia_registro=str(ref)
            )

        # Coherencia: stock == suma de movimientos
        for s in Stock.objects.all():
            neto = Decimal("0")
            for m in MovimientoInventario.objects.filter(producto=s.producto):
                signo = 1 if m.tipo_movimiento in ("INGRESO_COMPRA", "AJUSTE_POSITIVO") else -1
                neto += signo * m.cantidad_bandejas
            if neto != s.cantidad_bandejas:
                raise RuntimeError(f"Stock incoherente en {s.producto}: {neto} vs {s.cantidad_bandejas}")