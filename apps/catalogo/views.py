from datetime import date

from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.comunes import Estado
from config.formato import pesos
from config.permisos import ConsultaOAdministrador, EsAdministrador
from config.vistas import ABMConBajaLogica, anotar_actividad, validar

from .models import Formato, PrecioProducto, Presentacion, Producto, presentacion_permitida
from .precios import calcular
from .serializers import (
    ConfirmarPrecioSerializer,
    PrecioSerializer,
    PresentacionSerializer,
    ProductoSerializer,
)


class ProductoViewSet(ABMConBajaLogica):
    """ABM de productos: huevo por tipo y tamaño (HU-02-A, HU-02-B)."""

    permission_classes = [ConsultaOAdministrador]

    modelo = Producto
    serializer_class = ProductoSerializer
    search_fields = ["tipo_huevo", "tamano"]
    ordering_fields = ["tipo_huevo", "tamano", "id_producto"]
    ordering = ["tipo_huevo", "tamano"]


class PresentacionViewSet(ABMConBajaLogica):
    """ABM de presentaciones: unidad, bandeja (30 huevos), caja (6 bandejas) y su equivalencia en bandejas."""

    permission_classes = [ConsultaOAdministrador]

    modelo = Presentacion
    serializer_class = PresentacionSerializer
    search_fields = ["nombre"]
    ordering_fields = ["nombre", "cantidad_bandejas_equivalentes"]
    ordering = ["cantidad_bandejas_equivalentes"]


def nuevo_precio_vigente(producto, presentacion, precio):
    """Igual que los costos: el precio anterior se cierra hoy (historial) y el nuevo queda vigente."""
    PrecioProducto.objects.filter(
        producto=producto, presentacion=presentacion, fecha_hasta__isnull=True
    ).update(fecha_hasta=date.today())
    return PrecioProducto.objects.create(
        producto=producto, presentacion=presentacion, precio=precio, fecha_desde=date.today()
    )


def cajas_gemelas(presentacion, presentaciones):
    """Las otras cajas con la misma cantidad de huevos (Caja de 6 × 30 y Caja Súper de 9 × 20 = 180).

    Llevan siempre el mismo precio: se carga una vez y vale para las dos.
    """
    if presentacion.formato != Formato.CAJA:
        return []
    return [p for p in presentaciones if p.pk != presentacion.pk and p.formato == Formato.CAJA
            and p.cantidad_bandejas_equivalentes == presentacion.cantidad_bandejas_equivalentes]


class PrecioViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Precios de venta y precio sugerido (HU-02-C).

    GET  /precios/              precios vigentes (con ?historial=1 también los anteriores).
                                Filtros: ?producto=<id>  ?presentacion=<id>
    GET  /precios/sugeridos/    para cada producto: costo, gasto fijo, equilibrio y precio sugerido
    POST /precios/confirmar/    el administrador confirma un precio: queda vigente y el anterior al historial
    """

    serializer_class = PrecioSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # son pocos: la pantalla de venta los necesita todos juntos

    def get_queryset(self):
        precios = PrecioProducto.objects.select_related("producto__stock", "presentacion").filter(
            producto__estado=Estado.ACTIVO, presentacion__estado=Estado.ACTIVO
        ).order_by("producto__tipo_huevo", "producto__tamano", "presentacion__cantidad_bandejas_equivalentes")
        filtros = self.request.query_params
        if filtros.get("historial") != "1":
            precios = precios.filter(fecha_hasta__isnull=True)
        if filtros.get("producto"):
            precios = precios.filter(producto_id=filtros["producto"])
        if filtros.get("presentacion"):
            precios = precios.filter(presentacion_id=filtros["presentacion"])
        return precios

    @action(detail=False)
    def sugeridos(self, request):
        presentaciones = list(Presentacion.objects.filter(estado=Estado.ACTIVO).order_by("cantidad_bandejas_equivalentes"))
        vigentes = {(p.producto_id, p.presentacion_id): p.precio
                    for p in PrecioProducto.objects.filter(fecha_hasta__isnull=True)}
        filas = []
        for producto in Producto.objects.filter(estado=Estado.ACTIVO).order_by("tipo_huevo", "tamano"):
            propias = [p for p in presentaciones if presentacion_permitida(producto, p)]
            calculo = calcular(producto, propias)
            sugeridos = calculo.pop("sugeridos", {})
            # Las cajas gemelas se muestran en una sola fila (la de bandejas de 30) con un solo precio.
            ocultas = set()
            for p in sorted(propias, key=lambda p: -p.huevos_por_bandeja):
                if p.pk not in ocultas:
                    ocultas.update(g.pk for g in cajas_gemelas(p, propias))
            filas.append({
                "producto": producto.pk,
                "producto_nombre": str(producto),
                "calculo": calculo,
                "presentaciones": [{
                    "presentacion": p.pk,
                    "presentacion_nombre": p.nombre,
                    "bandejas": p.cantidad_bandejas_equivalentes,
                    "precio_vigente": vigentes.get((producto.pk, p.pk)),
                    "sugerido": sugeridos.get(p.pk),
                    "formato": p.formato,
                    "huevos_por_bandeja": p.huevos_por_bandeja,
                    "comparte_con": [g.nombre for g in cajas_gemelas(p, propias)],
                    # Alguna gemela tiene otro precio (o ninguno): al guardar se igualan.
                    "gemelas_desparejas": any(vigentes.get((producto.pk, g.pk)) != vigentes.get((producto.pk, p.pk))
                                              for g in cajas_gemelas(p, propias)),
                } for p in propias if p.pk not in ocultas],
            })
        return Response(filas)

    @action(detail=False, methods=["post"], permission_classes=[EsAdministrador])
    @transaction.atomic
    def confirmar(self, request):
        datos = validar(ConfirmarPrecioSerializer, request.data)
        producto, presentacion, precio = datos["producto"], datos["presentacion"], datos["precio"]

        calculo = calcular(producto, [presentacion])
        sugerido = calculo.get("sugeridos", {}).get(presentacion.pk)
        if sugerido and precio < sugerido and not datos["confirmar_bajo_equilibrio"]:
            raise ValidationError({
                "precio": f"No cubre los costos: el equilibrio es {pesos(sugerido)}. Si igual lo querés usar, confirmalo de nuevo.",
                "codigo": "bajo_equilibrio",
            })

        nuevo = nuevo_precio_vigente(producto, presentacion, precio)
        anotar_actividad(request.user, "Precio confirmado", nuevo)
        propias = [p for p in Presentacion.objects.filter(estado=Estado.ACTIVO) if presentacion_permitida(producto, p)]
        for gemela in cajas_gemelas(presentacion, propias):
            nuevo_precio_vigente(producto, gemela, precio)
        respuesta = PrecioSerializer(nuevo).data
        respuesta["ganancia_estimada"] = str(precio - sugerido) if sugerido else None
        return Response(respuesta, status=status.HTTP_201_CREATED)
