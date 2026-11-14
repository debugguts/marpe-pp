#!/bin/sh
# Arranque en Render: aplica las migraciones, crea el primer administrador (solo la primera vez) y levanta el servidor.
set -e
python manage.py migrate --noinput
python manage.py crear_admin_inicial
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers 2 --timeout 60 --access-logfile -
