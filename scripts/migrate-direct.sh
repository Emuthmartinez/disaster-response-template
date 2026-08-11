#!/usr/bin/env bash
# Corre las migraciones contra el endpoint DIRECTO de Neon (nunca el -pooler).
# Uso: doppler run --config <cfg> --command 'bash migrate-direct.sh <VAR_CON_LA_URL>'
# Nunca imprime la URL: solo el host enmascarado, para poder confirmar a ciegas
# que se apunta al sitio correcto.
set -euo pipefail

SRC_VAR="${1:-DATABASE_URL}"
URL="${!SRC_VAR:-}"
if [ -z "$URL" ]; then
  echo "[migrate] falta la variable $SRC_VAR" >&2
  exit 1
fi

# El endpoint directo de Neon es el mismo host sin el sufijo -pooler.
DIRECT="${URL/-pooler/}"

HOST=$(printf '%s' "$DIRECT" | sed -E 's#^[^@]*@##; s#/.*$##; s#\?.*$##')
case "$HOST" in
  *-pooler*) echo "[migrate] ABORTA: el host sigue siendo el pooler ($HOST)" >&2; exit 1 ;;
esac
echo "[migrate] destino: ${HOST}"

cd "$(dirname "$0")/../backend"
DATABASE_URL="$DIRECT" MIGRATIONS_DIR=../infra/db/migrations npm run migrate
