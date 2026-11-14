# Publicar el sistema en internet (Render + Neon, gratis)

**Cómo queda:** un solo servicio en Render arma la imagen `Dockerfile.render`: compila React y Django entrega la API y la pantalla
desde la misma dirección (`https://<nombre>.onrender.com`). La base de datos es PostgreSQL en Neon.
En la compu se sigue trabajando igual con `docker compose` (no cambia nada).

| Pieza | Servicio | Plan gratis |
|---|---|---|
| Servidor (Django + React) | Render · Web Service · Docker | 512 MB, se duerme a los 15 min sin uso (tarda ~1 min en despertar) |
| Base de datos | Neon · PostgreSQL | 1 GB, no vence (la de Render vence a los 30 días: por eso Neon) |

## 1. Base de datos en Neon
1. Entrar a https://neon.com con la cuenta de GitHub → **New project** → nombre `marpe`, región **AWS São Paulo** (la más cerca), Postgres 16.
2. En **Connection string** copiar la URL (`postgresql://usuario:clave@ep-....neon.tech/neondb?sslmode=require`).
   Es secreta: no va al repo ni al chat.

## 2. Servidor en Render
1. Entrar a https://render.com con la cuenta de GitHub y darle acceso al repo `marpe-pp2`.
2. **New → Blueprint** → elegir el repo. Render lee `render.yaml` y propone el servicio `marpe`.
3. Completar las variables que pide:
   - `DATABASE_URL` → la URL de Neon.
   - `MARPE_ADMIN_USUARIO` y `MARPE_ADMIN_CLAVE` → el primer administrador (clave de 8+ caracteres, no solo números).
4. **Apply**. El primer armado tarda ~5 min. Al terminar: `https://marpe.onrender.com` (o el nombre que quede).

Al arrancar, `deploy/iniciar.sh` aplica las migraciones y crea el administrador (solo si la base está vacía).
Cada `git push` a `main` vuelve a publicar solo.

## 3. Comprobar
- `https://<dirección>/api/salud/` → `{"estado": "ok"}` (servidor y base conectados).
- Entrar con el administrador → **Usuarios y roles** → crear el operador.
- Opcional, datos de demostración (solo en una base vacía de pruebas): en Render → **Shell** no está en el plan gratis,
  así que se cargan desde la compu apuntando a Neon:
  `DATABASE_URL="<url de neon>" DJANGO_SECRET_KEY=x python manage.py cargar_datos_prueba`

## Antes de la defensa
El plan gratis se duerme: abrir la página 2 minutos antes para despertarlo.

## Seguridad en producción (`DJANGO_HTTPS=1`)
HTTPS obligatorio (redirige), cookies de sesión y CSRF solo por HTTPS, HSTS, `DEBUG=0`, clave secreta generada por Render,
contraseñas cifradas por Django y la API cerrada sin sesión.
