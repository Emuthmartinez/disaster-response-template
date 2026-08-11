#!/usr/bin/env bash
# Postgres local DESECHABLE, de un solo comando, para probar comportamiento
# (no para desarrollo diario — para eso está docker-compose.yml). Existe
# porque staging suele estar casi vacío por diseño (mismo criterio que
# producción: nadie mete datos de prueba ahí) — así que "¿esto funciona de
# verdad?" para un flujo de auth, un seed, o una migración nueva necesita una
# base propia, real, y tirable, no staging.
#
# Qué hace `start` (el comando por defecto):
#   1. `initdb` un cluster de Postgres nuevo en un directorio temporal.
#   2. Lo arranca con un directorio de socket UNIX CORTO y aparte de los datos
#      (ver nota `-k` más abajo).
#   3. Crea el rol y la base de datos de la app.
#   4. Corre las migraciones de infra/db/ (vía MIGRATIONS_DIR) — y de paso el
#      seed de auth (capacidades + rol admin; ver src/auth/seed.ts), así que
#      la base sale lista para probar login/roles, no solo con el esquema.
#   5. Imprime el DATABASE_URL a usar y CÓMO PARARLA.
#
# Uso:
#   backend/scripts/local-db.sh              # crea, migra, dejar corriendo
#   backend/scripts/local-db.sh start         # lo mismo, explícito
#   backend/scripts/local-db.sh stop          # para el servidor y borra todo
#   backend/scripts/local-db.sh status        # ¿sigue corriendo? imprime el estado
#
#   LOCAL_DB_PORT=55432 backend/scripts/local-db.sh   # puerto TCP (default 55432,
#                                                      # deliberadamente distinto
#                                                      # del 5432 de docker-compose
#                                                      # para poder tener ambos a
#                                                      # la vez sin choque)
#   SEED_ADMIN_EMAIL=admin@example.org SEED_ADMIN_PASSWORD=CHANGE_ME \
#     backend/scripts/local-db.sh                     # además crea el primer
#                                                      # superadmin (ver
#                                                      # src/auth/seed.ts) —
#                                                      # opcional, sin esto la
#                                                      # base sale sin usuarios.
#
# Por qué `-k` a un directorio CORTO en /tmp, aparte del datadir:
# los sockets UNIX de Postgres se llaman `<socket_dir>/.s.PGSQL.<puerto>`, y el
# campo `sun_path` del kernel para un socket UNIX tiene un límite duro de
# ~103-108 bytes (depende del SO). El datadir de este script vive bajo
# `mktemp -d`, que en macOS es algo como
# `/var/folders/xx/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/T/local-db.XXXXXX/data` —
# eso solo, sin el nombre del socket, YA puede pasarse del límite. La solución
# estándar (la misma que usa el propio `pg_virtualenv`/`pg_ctlcluster` en
# distros que empaquetan Postgres) es separar los dos: el datadir puede ser
# tan largo como haga falta, pero el socket vive en su PROPIO directorio corto
# (`/tmp/pgXXXXXX`, vía `mktemp -d -p /tmp`), pasado a `pg_ctl`/`postgres` con
# `-o "-k <dir>"`.
#
# Por qué `LC_ALL=C` en el `initdb`: sin fijar el locale, `initdb` toma el del
# entorno del operador (variable, entre máquinas y entre CI/local), lo que
# hace que el ORDEN de collation de un `ORDER BY`/`LIKE` sobre texto varíe
# según en qué máquina se creó la base — un desajuste sutil entre "funciona en
# mi laptop" y CI. `C` es el locale determinista de Postgres: mismo orden de
# bytes en cualquier máquina, siempre.
#
# Requiere los binarios de Postgres en PATH: initdb, pg_ctl, createuser,
# createdb, psql (p.ej. `brew install postgresql@16` en macOS, o el paquete
# `postgresql` de tu distro). NO usa Docker a propósito — más rápido de armar
# y tirar que levantar un contenedor para una prueba de humo.

set -euo pipefail

ACTION="${1:-start}"

# Estado: dónde vive el datadir/sockdir de la instancia actual, si hay una.
# Fichero fijo (no temporal) para que `stop`/`status` en una terminal DISTINTA
# encuentren la misma instancia que dejó corriendo `start`.
STATE_FILE="${TMPDIR:-/tmp}/mapa-local-db.state"

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Falta '$1' en PATH. Instala las herramientas de cliente/servidor de Postgres (p.ej. 'brew install postgresql@16') y reintenta." >&2
    exit 2
  }
}

status() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "No hay una instancia local-db registrada (no existe $STATE_FILE)."
    return 1
  fi
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  if pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    echo "Corriendo."
    echo "  DATABASE_URL=postgres://$DB_ROLE:$DB_PASSWORD@127.0.0.1:$DB_PORT/$DB_NAME"
    echo "  datadir: $PGDATA_DIR"
    echo "  sockdir: $SOCK_DIR"
    return 0
  else
    echo "Registrada en $STATE_FILE pero NO corriendo (¿se cayó, o quedó de una sesión anterior sin 'stop' limpio?)."
    return 1
  fi
}

stop() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "Nada que parar (no existe $STATE_FILE)."
    return 0
  fi
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  echo "Parando Postgres en $PGDATA_DIR..."
  pg_ctl -D "$PGDATA_DIR" -m fast stop || true
  rm -rf "$PGDATA_DIR" "$SCRATCH_ROOT" "$SOCK_DIR"
  rm -f "$STATE_FILE"
  echo "Listo: servidor parado y directorios temporales borrados (era desechable)."
}

start() {
  require_bin initdb
  require_bin pg_ctl
  require_bin createuser
  require_bin createdb
  require_bin psql

  if [ -f "$STATE_FILE" ]; then
    # shellcheck disable=SC1090
    . "$STATE_FILE"
    if pg_ctl -D "$PGDATA_DIR" status >/dev/null 2>&1; then
      echo "Ya hay una instancia corriendo — usa 'stop' primero, o conéctate directamente:"
      status
      exit 0
    fi
    echo "Instancia previa registrada pero caída; limpiando antes de crear una nueva."
    rm -rf "$PGDATA_DIR" "$SCRATCH_ROOT" "$SOCK_DIR" 2>/dev/null || true
    rm -f "$STATE_FILE"
  fi

  DB_PORT="${LOCAL_DB_PORT:-55432}"
  DB_ROLE="${LOCAL_DB_ROLE:-mapa_app}"
  DB_PASSWORD="${LOCAL_DB_PASSWORD:-localdev}"
  DB_NAME="${LOCAL_DB_NAME:-app}"

  SCRATCH_ROOT="$(mktemp -d -t local-db-XXXXXX)"
  PGDATA_DIR="$SCRATCH_ROOT/data"
  # Directorio del SOCKET aparte del datadir y deliberadamente en /tmp (no en
  # $SCRATCH_ROOT, que en macOS cuelga de /var/folders/.../T/, ya demasiado
  # largo por sí solo) — ver nota "-k" arriba.
  SOCK_DIR="$(mktemp -d /tmp/pgXXXXXX)"

  echo "Creando cluster Postgres desechable..."
  echo "  datadir: $PGDATA_DIR"
  echo "  sockdir: $SOCK_DIR"
  echo "  puerto:  $DB_PORT"

  LC_ALL=C initdb -D "$PGDATA_DIR" -U postgres --auth=trust --no-locale -E UTF8 >/dev/null

  pg_ctl -D "$PGDATA_DIR" -l "$SCRATCH_ROOT/postgres.log" \
    -o "-k $SOCK_DIR -h 127.0.0.1 -p $DB_PORT" start

  # Guarda el estado YA (antes de seguir) para que un 'stop' posterior pueda
  # limpiar aunque algo falle más abajo (createuser, migrate, ...).
  cat > "$STATE_FILE" <<EOF
SCRATCH_ROOT="$SCRATCH_ROOT"
PGDATA_DIR="$PGDATA_DIR"
SOCK_DIR="$SOCK_DIR"
DB_PORT="$DB_PORT"
DB_ROLE="$DB_ROLE"
DB_PASSWORD="$DB_PASSWORD"
DB_NAME="$DB_NAME"
EOF

  # Rol normal (NO superuser) — el dueño de su propia base basta para correr
  # las migraciones (no hay CREATE EXTENSION en infra/db/migrations/), y es
  # más fiel a producción: en Neon, el rol de la app tampoco es superuser.
  createuser -h "$SOCK_DIR" -p "$DB_PORT" -U postgres "$DB_ROLE" 2>/dev/null || true
  psql -h "$SOCK_DIR" -p "$DB_PORT" -U postgres -c \
    "ALTER USER \"$DB_ROLE\" WITH PASSWORD '$DB_PASSWORD';" >/dev/null
  createdb -h "$SOCK_DIR" -p "$DB_PORT" -U postgres -O "$DB_ROLE" "$DB_NAME"

  DATABASE_URL="postgres://$DB_ROLE:$DB_PASSWORD@127.0.0.1:$DB_PORT/$DB_NAME"

  echo "Corriendo migraciones (infra/db/migrations) + seed de auth..."
  (
    cd "$(dirname "$0")/.."
    DATABASE_URL="$DATABASE_URL" MIGRATIONS_DIR=../infra/db/migrations npm run migrate
  )

  echo
  echo "Lista. Base desechable arriba y migrada:"
  echo
  echo "  DATABASE_URL=$DATABASE_URL"
  echo
  if [ -n "${SEED_ADMIN_EMAIL:-}" ]; then
    echo "  Superadmin sembrado: $SEED_ADMIN_EMAIL (ver SEED_ADMIN_PASSWORD que hayas pasado)."
  else
    echo "  Sin SEED_ADMIN_EMAIL: la base quedó SIN usuarios. Re-corre con"
    echo "  SEED_ADMIN_EMAIL=admin@example.org SEED_ADMIN_PASSWORD=CHANGE_ME si necesitas login."
  fi
  echo
  echo "  Parar y borrar todo:  backend/scripts/local-db.sh stop"
  echo "  Ver estado:            backend/scripts/local-db.sh status"
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "Uso: $0 [start|stop|status]" >&2
    exit 2
    ;;
esac
