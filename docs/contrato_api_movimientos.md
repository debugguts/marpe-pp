# Contrato de la API — Tablas de movimiento (Sprint 5)

Huevería Marpe · Práctica Profesional II · Comisión 2C

- Base: `http://localhost:8080/api/`
- Formato: JSON. Fechas `AAAA-MM-DD`, fecha y hora en ISO 8601. Importes como texto con 2 decimales (`"14000.00"`).
- Sesión: todos los movimientos piden haber iniciado sesión (`POST /api/auth/login/`), porque guardan qué usuario los hizo. Sin sesión responden **403**.
- Listados paginados de a 20: `{ "count", "next", "previous", "results": [...] }` (salvo `precios`, `stock` y los movimientos de una caja, que vienen completos).
- Errores: **400** con el problema por campo, por ejemplo `{ "cantidad": ["Asegúrese de que este valor sea mayor o igual a 0.001."] }`. Los errores que no son de un campo vienen en `non_field_errors`.
- Cada alta queda registrada en `REGISTRO_ACTIVIDAD` (quién, qué y cuándo).

## Resumen de endpoints

| Recurso | Método y dirección | Qué hace | Historia |
| --- | --- | --- | --- |
| Caja | `GET /cajas/` | Historial de cajas (`?desde`, `?hasta`) | HU-10-D |
| | `POST /cajas/` | Abre la caja (solo puede haber una abierta) | HU-10-A |
| | `GET /cajas/actual/` | La caja abierta, o `null` | HU-10 |
| | `GET /cajas/<id>/movimientos/` | Movimientos en efectivo de esa caja | HU-10 |
| | `POST /cajas/<id>/movimientos/` | Ingreso o retiro manual, con motivo | HU-10-B |
| | `POST /cajas/<id>/cerrar/` | Cierre con arqueo | HU-10-C |
| Compras | `GET /compras/` | Lista (`?proveedor`, `?desde`, `?hasta`) | HU-04-C |
| | `POST /compras/` | Registra la compra y suma al stock | HU-04-A/B |
| | `GET /compras/<id>/` | Compra con su detalle | HU-04-C |
| Ventas | `GET /ventas/` | Lista (`?cliente`, `?modalidad`, `?estado=CONFIRMADA\|ANULADA`, `?desde`, `?hasta`) | HU-05-H |
| | `POST /ventas/` | Registra la venta: precio vigente, stock, cobro o fiado | HU-05-A a F |
| | `GET /ventas/<id>/` | Venta con detalle y pagos | HU-05-H |
| | `PUT /ventas/<id>/` | Solo administrador: modificación completa (mismos datos que el alta) | HU-05 |
| | `POST /ventas/<id>/anular/` | Solo administrador: anula con motivo; devuelve stock y efectivo | HU-05 |
| Cuenta corriente | `GET /cuentas-corrientes/` | Deudas (`?cliente`, `?estado=PENDIENTE\|CANCELADA`) | HU-07-C/E |
| | `POST /cuentas-corrientes/<id>/cobrar/` | Cobra el total de la deuda | HU-05-G, HU-07-D |
| Gastos | `GET /gastos/` | Lista (`?desde`, `?hasta`, `?tipo`, `?search`) | HU-09-B |
| | `POST /gastos/` | Alta; en efectivo sale de la caja | HU-09-A/E |
| | `PATCH /gastos/<id>/` | Corrige fecha, concepto, categoría o tipo | HU-09-C |
| | `GET /gastos/resumen/` | Totales del mes: fijos, variables y por categoría (`?mes=AAAA-MM`) | HU-09-D |
| Stock | `GET /stock/` | Existencias en bandejas y por presentación (`?bajo_minimo=1`) | HU-06-A/B |
| | `PATCH /stock/<id_producto>/` | Cambia el stock mínimo | HU-06 |
| Movimientos de stock | `GET /movimientos-inventario/` | Lista (`?producto`, `?tipo`, `?desde`, `?hasta`) | HU-06-C, HU-08-B |
| | `POST /movimientos-inventario/` | Merma o ajuste, con motivo | HU-06-D, HU-08-A |
| Precios | `GET /precios/` | Precios vigentes con el stock de cada producto (`?historial=1`) | HU-02-C |
| | `GET /precios/sugeridos/` | Costo, gasto fijo, equilibrio y sugerido por producto | HU-02-C |
| | `POST /precios/confirmar/` | Solo administrador: deja vigente un precio nuevo | HU-02-C |

## Ejemplos

### Abrir, mover y cerrar la caja

```json
POST /api/cajas/
{ "saldo_inicial": "15000" }

POST /api/cajas/3/movimientos/
{ "tipo_movimiento": "RETIRO", "importe": "3000", "motivo": "Depósito en el banco" }

POST /api/cajas/3/cerrar/
{ "efectivo_contado": "11800" }
```

Respuesta del cierre:

```json
{
  "id_caja": 3, "estado": "CERRADA", "saldo_inicial": "15000.00",
  "saldo_esperado": "12000.00", "efectivo_contado": "11800.00", "diferencia": "-200.00",
  "usuario_cierre_nombre": "operador", "fecha_hora_cierre": "2026-11-12T20:05:11-03:00"
}
```

Reglas: saldo esperado = saldo inicial + ventas y cobros en efectivo + ingresos − gastos en efectivo − retiros. Un retiro no puede superar el efectivo de la caja. Una caja cerrada no acepta movimientos ni otro cierre.

### Registrar una compra

```json
POST /api/compras/
{
  "proveedor": 1,
  "fecha": "2026-11-12",
  "detalles": [
    { "producto": 1, "presentacion": 3, "cantidad": "2", "precio_unitario": "60000" },
    { "producto": 2, "presentacion": 2, "cantidad": "10" }
  ]
}
```

- Si una línea no trae `precio_unitario`, se usa el costo vigente que tiene cargado el proveedor. Si no tiene, responde 400 indicando qué falta.
- Cada línea suma al stock convertida a bandejas: 2 cajas × 6 = 12 bandejas.

### Registrar una venta

```json
POST /api/ventas/
{
  "modalidad": "CONTADO",
  "medio_pago": "EFECTIVO",
  "detalles": [ { "producto": 1, "presentacion": 2, "cantidad": "2" } ]
}
```

```json
POST /api/ventas/
{
  "modalidad": "FIADO",
  "cliente": 3,
  "detalles": [ { "producto": 2, "presentacion": 2, "cantidad": "3" } ]
}
```

Respuesta (resumida):

```json
{
  "id_venta": 15, "modalidad": "CONTADO", "cliente": 1, "cliente_nombre": "Consumidor final",
  "total": "14000.00", "saldo_pendiente": null,
  "detalles": [ { "producto_nombre": "Blanco Mediano", "presentacion_nombre": "Bandeja",
                  "cantidad": "2.000", "precio_unitario_aplicado": "7000.00", "subtotal": "14000.00" } ],
  "pagos": [ { "medio_pago": "EFECTIVO", "importe": "14000.00", "referencia_transferencia": null } ]
}
```

Reglas:

- El precio no lo manda la pantalla: se usa el precio vigente y queda guardado en la venta aunque después cambie.
- Sin cliente, la venta es a «Consumidor final». Para **fiar** hay que elegir un cliente registrado.
- **Contado** pide medio de pago; **transferencia** pide referencia; **efectivo** pide una caja abierta.
- Si no alcanza el stock de algún producto no se vende nada: `"Stock insuficiente de Castaño Súper: hay 3 bandejas y se necesitan 12."`
- Una venta no se borra (`DELETE` responde 405): se modifica o se anula, y siempre queda registrada.

### Modificar una venta (solo administrador)

```json
PUT /api/ventas/15/
{
  "modalidad": "FIADO",
  "cliente": 3,
  "detalles": [ { "producto": 1, "presentacion": 3, "cantidad": "1" } ]
}
```

Se manda la venta completa, igual que en el alta (`PATCH` hace lo mismo). El sistema, en una sola transacción:

1. Devuelve al stock las bandejas que había descontado la venta (movimiento `AJUSTE_POSITIVO` con motivo «Modificación de la venta 15»).
2. Reemplaza las líneas y el cobro, y vuelve a descontar el stock y a cobrar o fiar con los datos nuevos.
3. Si antes había entrado efectivo, lo saca de la caja abierta (movimiento `RETIRO` con el mismo motivo).

Reglas:

- La venta conserva su número y su fecha; se guarda `fecha_modificacion`.
- Las líneas que ya estaban conservan su precio; las nuevas toman el precio vigente.
- Si no alcanza el stock, no se modifica nada.
- Cómo estaba la venta antes queda escrito en `REGISTRO_ACTIVIDAD` (operación «Modificación»).
- No se puede modificar una venta anulada ni una venta fiada cuya deuda ya se cobró.

### Anular una venta (solo administrador)

```json
POST /api/ventas/15/anular/
{ "motivo": "El cliente devolvió la mercadería" }
```

La venta pasa a `ANULADA` con su motivo y su fecha de anulación, y conserva el detalle y los pagos. Se devuelve el stock y, si fue en efectivo, el dinero sale de la caja abierta. Si era fiada, la deuda se da de baja (saldo 0). Una venta anulada no se modifica ni se vuelve a anular. El operador recibe 403.

### Cobrar una deuda

```json
POST /api/cuentas-corrientes/4/cobrar/
{ "importe": "21000", "medio_pago": "TRANSFERENCIA", "referencia_transferencia": "TRF-0042" }
```

En esta versión la deuda se cancela en un solo pago por el total (HU-05-G). En efectivo, entra a la caja.

### Cargar un gasto

```json
POST /api/gastos/
{
  "fecha": "2026-11-12", "concepto": "Alquiler del local", "categoria": "Alquiler",
  "tipo": "FIJO", "importe": "150000", "medio_pago": "TRANSFERENCIA"
}
```

`tipo` es `FIJO` o `VARIABLE` (por defecto, variable). Los fijos entran en el precio sugerido. Al editar, el importe y el medio de pago no se cambian.

### Merma o ajuste de stock

```json
POST /api/movimientos-inventario/
{ "tipo_movimiento": "MERMA", "producto": 1, "presentacion": 2, "cantidad": "1", "motivo": "Huevos rotos en la descarga" }
```

`tipo_movimiento`: `MERMA`, `AJUSTE_POSITIVO` o `AJUSTE_NEGATIVO`. Las compras y ventas mueven el stock solas y no se cargan acá.

### Precio sugerido y confirmación

```json
GET /api/precios/sugeridos/
[
  {
    "producto": 1, "producto_nombre": "Blanco Mediano",
    "calculo": {
      "costo_bandeja": 5750.0, "origen_costo": "compras del mes",
      "gasto_fijo_bandeja": 1000.0, "gastos_fijos_mes": 210000.0, "bandejas_compradas_mes": 210.0,
      "equilibrio_bandeja": 6750.0
    },
    "presentaciones": [
      { "presentacion": 2, "presentacion_nombre": "Bandeja", "bandejas": 1.0, "precio_vigente": 7000.0, "sugerido": 6750.0 },
      { "presentacion": 3, "presentacion_nombre": "Caja", "bandejas": 6.0, "precio_vigente": 40000.0, "sugerido": 40500.0 }
    ]
  }
]
```

- **Costo por bandeja**: promedio ponderado de lo comprado en el mes (lo pagado ÷ bandejas compradas). Si el producto no tuvo compras en el mes, se usa el promedio de los costos vigentes de los proveedores.
- **Gasto fijo por bandeja**: gastos fijos del mes ÷ bandejas compradas en el mes.
- **Sugerido** = lo que cuesta esa presentación: (costo + gasto fijo) × bandejas de la presentación. La pantalla le suma la ganancia que elija el administrador. En este endpoint los importes vienen como números.

```json
POST /api/precios/confirmar/
{ "producto": 1, "presentacion": 2, "precio": "7500" }
```

Responde 201 con el precio nuevo y `"ganancia_estimada": "750.00"`. Si el precio queda por debajo del equilibrio responde 400 con `"codigo": "bajo_equilibrio"`; para usarlo igual se reenvía con `"confirmar_bajo_equilibrio": true`. Solo el administrador puede confirmar (403 para el operador).
