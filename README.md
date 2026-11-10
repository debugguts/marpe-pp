# Huevería Marpe — Sistema de gestión

Práctica Profesional II · Comisión 2C
Autores: Quispe Camila del Milagro y Siñanis Gustavo Exequiel

Sistema de inventario y punto de venta para un local de venta de huevos
(Cerrillos, Salta). Estado actual: **Sprint 5** (movimientos: caja, compras, ventas,
fiado y cobros, gastos, stock y mermas, y precio de venta sugerido).

## Stack

Python 3.12 · Django 5.2 LTS · Django REST Framework · PostgreSQL 16 · Gunicorn · Nginx · Docker Compose
Frontend: React 19 · Vite · React Router · TanStack Query (sin librería de componentes: estilos propios con el manual de identidad)

## Requisitos

- Docker Desktop en ejecución
- Git
- Node.js 22 o superior (solo para trabajar el frontend en modo desarrollo)

## Puesta en marcha

```bash
cp .env.example .env        # editar POSTGRES_PASSWORD (sin espacios ni comillas)
docker compose up -d --build
docker compose exec -e DJANGO_SUPERUSER_PASSWORD=<clave> web python manage.py createsuperuser --noinput --username admin --email admin@marpe.local
docker compose exec web python manage.py cargar_datos_prueba
```

| Qué                         | Dirección                     |
| --------------------------- | ----------------------------- |
| Sistema (frontend + API)    | http://localhost:8080/        |
| API REST navegable          | http://localhost:8080/api/    |
| Panel de administración     | http://localhost:8080/admin/  |

Usuarios de prueba (solo desarrollo): `admin` (el que se crea arriba) y `operador` / `marpe1234`.

### Después de un `git pull`

El contenedor no lee los archivos en vivo: hay que reconstruir.

```bash
docker compose up -d --build web      # cambios en Python (las migraciones se aplican solas)
docker compose up -d --build nginx    # cambios en el frontend
```

### Frontend en modo desarrollo (recarga al guardar)

```bash
cd frontend
npm install        # la primera vez y cada vez que cambie package.json
npm run dev        # http://localhost:5173 (usa la API de Docker en el 8080)
```

## Pruebas

```bash
docker compose exec web python manage.py test tests
```

## API REST (Sprint 4)

Todas las tablas maestras usan la misma base (`config/vistas.py`): listado paginado de a 20,
búsqueda con `?search=`, filtro `?estado=ACTIVO|INACTIVO`, y **baja lógica** (pasa a INACTIVO, no se borra).
Cada alta, modificación y baja queda en `REGISTRO_ACTIVIDAD`.

| Recurso              | Dirección                     | Regla especial                                         |
| -------------------- | ----------------------------- | ------------------------------------------------------ |
| Proveedores          | `/api/proveedores/`           | —                                                      |
| Costos de proveedor  | `/api/costos-proveedor/`      | Un solo costo vigente; cambiar el precio guarda historial |
| Productos            | `/api/productos/`             | No se repite tipo + tamaño                             |
| Presentaciones       | `/api/presentaciones/`        | Equivalencia en bandejas mayor que 0                   |
| Clientes             | `/api/clientes/`              | «Consumidor final» (id 1) no se modifica ni se da de baja |
| Sesión               | `/api/auth/login/` · `logout/` · `yo/` | Sesión de Django con cookie                   |

## API REST de movimientos (Sprint 5)

Detalle completo, con ejemplos de JSON: [`docs/contrato_api_movimientos.md`](docs/contrato_api_movimientos.md).
Todos piden haber iniciado sesión, porque guardan qué usuario hizo cada operación.

| Recurso              | Dirección                         | Regla principal                                                    |
| -------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Caja                 | `/api/cajas/`                     | Una sola abierta; cierre con arqueo (esperado vs. contado)         |
| Compras              | `/api/compras/`                   | Suma al stock en bandejas; sin precio usa el costo del proveedor   |
| Ventas               | `/api/ventas/`                    | Precio vigente congelado; descuenta stock; efectivo entra a caja   |
| Cuenta corriente     | `/api/cuentas-corrientes/`        | La venta fiada abre la deuda; se cobra el total                    |
| Gastos               | `/api/gastos/`                    | Fijo o variable; en efectivo sale de la caja                       |
| Stock                | `/api/stock/`                     | En bandejas y por presentación; aviso de stock mínimo              |
| Movimientos de stock | `/api/movimientos-inventario/`    | Mermas y ajustes siempre con motivo                                |
| Precios              | `/api/precios/`                   | Sugerido = costo + gasto fijo por bandeja; confirma el administrador |

## Estructura

| Carpeta     | Contenido                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`   | Configuración de Django, rutas de la API (`api.py`), base de los ABM (`vistas.py`) y validaciones comunes                              |
| `apps/`     | 11 apps, una por responsabilidad: usuarios, proveedores, clientes, catalogo, inventario, caja, compras, gastos, ventas, mermas, reportes |
| `frontend/` | Aplicación React: `pages/` (pantallas), `components/` (piezas reutilizables), `lib/` (pedidos a la API), `styles/`                     |
| `tests/`    | Pruebas de integridad de la base de datos y de la API                                                                                   |
| `nginx/`    | Proxy inverso: sirve el frontend compilado y deriva `/api` y `/admin` a Django                                                          |
| `docs/`     | DER, diccionario de datos y documentación                                                                                               |

## Decisiones de diseño

Sprint 3

- Cuenta corriente 1:N con pagos de cuenta (varios cobros posibles).
- Cliente fijo "Consumidor final" (`id_cliente = 1`); `venta.cliente` es obligatorio y una venta fiada no puede usarlo.
- Tablas puente 1:1 entre operaciones y movimientos de inventario o de caja.
- Stock en bandejas con `DecimalField(12, 6)`.
- Mermas y ajustes se registran en `movimiento_inventario` (sin tabla propia).
- Usuarios, grupos y permisos con los modelos nativos de Django.

Sprint 4

- Frontend desacoplado (React + Vite) servido por Nginx en el mismo dominio que la API: la sesión viaja en una cookie y no hace falta CORS.
- Los costos los carga el proveedor (`COSTO_PROVEEDOR`) con historial: nunca se pisa un precio, se cierra el vigente y se crea uno nuevo.
- Las pantallas ABM comparten un mismo listado (`ListadoABM`) y formulario (`FormularioABM`); cada pantalla solo define sus columnas y campos.
- Permisos de la API abiertos (`AllowAny`) hasta el taller de seguridad; el frontend ya oculta lo que no corresponde a cada rol.

Sprint 5

- Las reglas de negocio viven en un archivo `servicios.py` por app (caja, inventario, compras, ventas): las vistas solo reciben el pedido y responden.
- Todo movimiento de stock pasa por `mover_stock()` y todo movimiento de efectivo por `mover_caja()`: así el stock y la caja siempre coinciden con sus movimientos.
- Cada operación se guarda en una transacción: si algo falla (por ejemplo, falta stock), no queda nada a medias.
- Precio sugerido: (costo promedio ponderado del mes + gastos fijos del mes ÷ bandejas compradas en el mes) × bandejas de la presentación. El administrador lo confirma y el anterior pasa al historial.
- Los movimientos piden sesión iniciada (`IsAuthenticated`); confirmar precios, además, rol Administrador.
