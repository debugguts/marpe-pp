
# Huevería Marpe — Sistema de gestión

Práctica Profesional II · Comisión 2C
Autores: Quispe Camila del Milagro y Siñanis Gustavo Exequiel

Sistema de inventario y punto de venta para un local de venta de huevos
(Cerrillos, Salta). Estado actual: **Sprint 3** (base de datos, modelos, admin y pruebas).

## Stack

Python 3.12 · Django 5.2 LTS · PostgreSQL 16 · Gunicorn · Nginx · Docker Compose

## Requisitos

- Docker Desktop en ejecución
- Git

## Puesta en marcha

```bash
cp .env.example .env        # editar POSTGRES_PASSWORD (sin espacios ni comillas)
docker compose up -d --build
docker compose exec -e DJANGO_SUPERUSER_PASSWORD=<clave> web python manage.py createsuperuser --noinput --username admin --email admin@marpe.local
docker compose exec web python manage.py cargar_datos_prueba
```

Panel de administración: http://localhost:8080/admin/

Usuarios de prueba (solo desarrollo): `admin` (el que se crea arriba) y `operador` / `marpe1234`.

## Pruebas

```bash
docker compose exec web python manage.py test tests
```

## Estructura

| Carpeta     | Contenido                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `config/` | Configuración de Django y elementos comunes (`comunes.py`)                                                                            |
| `apps/`   | 11 apps, una por responsabilidad: usuarios, proveedores, clientes, catalogo, inventario, caja, compras, gastos, ventas, mermas, reportes |
| `tests/`  | Pruebas de integridad de la base de datos                                                                                                |
| `nginx/`  | Configuración del proxy inverso                                                                                                         |
| `docs/`   | DER, diccionario de datos y documentación                                                                                               |

## Decisiones de diseño (Sprint 3)

- Cuenta corriente 1:N con pagos de cuenta (varios cobros posibles).
- Cliente fijo "Consumidor final" (`id_cliente = 1`); `venta.cliente` es obligatorio y una venta fiada no puede usarlo.
- Tablas puente 1:1 entre operaciones y movimientos de inventario o de caja.
- Stock en bandejas con `DecimalField(12, 6)`.
- Mermas y ajustes se registran en `movimiento_inventario` (sin tabla propia).
- Usuarios, grupos y permisos con los modelos nativos de
prueba