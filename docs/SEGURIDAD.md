# Seguridad del sistema · Huevería Marpe

Auditoría hecha sobre el código real (Django REST + PostgreSQL + Firebase) y medidas aplicadas en el
sprint de seguridad. Cada punto tiene su prueba automática en `tests/test_seguridad.py` o en las pruebas
de cada módulo.

## Ataques probados y cómo se frenan

| Ataque | Qué haría un intruso | Cómo lo frena el sistema |
|---|---|---|
| Fuerza bruta en el login | Probar miles de claves seguidas | Máximo 8 intentos por minuto por dirección; después responde 429 y hay que esperar (V1) |
| Saturar la API | Mandar pedidos sin parar | 60 pedidos por minuto sin sesión y 120 con sesión (V1/V5) |
| Ventas o compras gigantes | Una venta con miles de líneas para trabar el servidor | Máximo 50 líneas por venta o compra y 512 KB por pedido (V2) |
| Robar la sesión | Leer la cookie desde JavaScript o usarla desde otro sitio | Cookie HttpOnly, SameSite=Lax y, publicada, solo por HTTPS (V3) |
| Inyección SQL | Meter código SQL en un campo | El ORM de Django arma consultas parametrizadas |
| XSS | Guardar un `<script>` en un nombre | React y las plantillas de Django escapan todo el texto |
| Vender el mismo stock dos veces | Dos ventas al mismo tiempo | `select_for_update` bloquea el stock mientras se descuenta |
| Token de Firebase falso | Entrar a la app móvil con un token armado | Se verifican firma, proyecto, emisor, vencimiento, correo verificado y usuario activo |
| Mandar campos de más | Cambiar el total o el estado desde el pedido | Los serializers solo aceptan los campos declarados; el total lo calcula el servidor |
| Pedidos desde otra web | Usar la API desde otro dominio | Sin CORS abierto y con token CSRF en todo lo que cambia datos |
| Borrar el historial | Eliminar una venta, compra o gasto | No se borra: se anula con motivo y queda en la auditoría |

## Decisiones de negocio documentadas

- **V4 · El operador ve los clientes y sus deudas.** Es un solo local y el operador cobra los fiados en el
  mostrador, así que necesita ver teléfono y saldo. Se decidió no restringirlo; si el negocio crece,
  se puede limitar el teléfono al administrador.
- **Límites por proceso.** Los contadores de intentos viven en la memoria de cada proceso del servidor:
  alcanzan para un negocio chico. Con varios servidores habría que pasarlos a una caché compartida (Redis).
