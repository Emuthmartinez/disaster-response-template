#!/usr/bin/env bash
# Verificación de jobs de fondo por FRESCURA DERIVADA: sin una tabla dedicada
# de job_runs, se comprueba lo que los jobs YA escriben (el catálogo que
# sincronizan, /api/readyz, y opcionalmente el conteo de cartas muertas en
# audit_log). NO escribe nada en ningún entorno — es un smoke check de
# solo-lectura, seguro de correr en producción.
#
# Uso:
#   scripts/verify-jobs.sh staging
#   scripts/verify-jobs.sh production
#   API_URL=https://api.mi-despliegue.example scripts/verify-jobs.sh production
#
# Variables (todas sobreescribibles; los defaults son ejemplo.org, obviamente
# falsos, y el catálogo de ejemplo es el de sismos que el template ya trae):
#
#   API_URL                  Origin del backend (default por entorno abajo).
#   FEED_PATH                 Endpoint de solo-lectura del catálogo que un cron
#                             sincroniza periódicamente (default /api/earthquakes
#                             — el sync de sismos del template).
#   FEED_TIME_FIELD            Campo(s) de timestamp a inspeccionar en cada item
#                             del feed, separados por coma, en orden de
#                             preferencia (default "time,occurredAt").
#   FRESHNESS_THRESHOLD_HOURS   Antigüedad máxima aceptable del item más
#                             reciente antes de marcar FAIL (default 24 — el
#                             template sincroniza cada 5 min; 24h es un umbral
#                             generoso para no dar falsos rojos en días quietos
#                             sin actividad real que sincronizar).
#   DOPPLER_PROJECT            Proyecto de Doppler (default placeholder
#                             <tu-proyecto-doppler> — ver disaster-secrets-bootstrap).
#   DOPPLER_CONFIG_STAGING      Config de Doppler para staging (default "stg").
#   DOPPLER_CONFIG_PRODUCTION   Config de Doppler para producción (default "prd").
#
# El check de cartas muertas solo corre si `doppler` está en PATH Y
# DOPPLER_PROJECT fue configurado a un valor real (no el placeholder) — sin
# eso, se omite con un INFO, no un FAIL: no tener Doppler a mano no es un fallo
# de los jobs en sí.

set -euo pipefail

ENVIRONMENT="${1:-staging}"
case "$ENVIRONMENT" in
  staging)
    API_URL="${API_URL:-https://api-staging.mapa.example.org}"
    DOPPLER_CONFIG="${DOPPLER_CONFIG_STAGING:-stg}"
    ;;
  production|prod)
    API_URL="${API_URL:-https://api.mapa.example.org}"
    DOPPLER_CONFIG="${DOPPLER_CONFIG_PRODUCTION:-prd}"
    ;;
  *)
    echo "uso: $0 [staging|production]  (o exporta API_URL directamente)" >&2
    exit 2
    ;;
esac

DOPPLER_PROJECT="${DOPPLER_PROJECT:-<tu-proyecto-doppler>}"
FEED_PATH="${FEED_PATH:-/api/earthquakes?limit=1}"
FEED_TIME_FIELD="${FEED_TIME_FIELD:-time,occurredAt}"
FRESHNESS_THRESHOLD_HOURS="${FRESHNESS_THRESHOLD_HOURS:-24}"

echo "Entorno: $ENVIRONMENT"
echo "  api:  $API_URL"
echo "  feed: $FEED_PATH (umbral ${FRESHNESS_THRESHOLD_HOURS}h)"
echo

FALLOS=0
check() { # check <etiqueta> <ok?1:0> <detalle>
  if [ "$2" = "1" ]; then echo "PASS  $1 — $3"; else echo "FAIL  $1 — $3"; FALLOS=$((FALLOS+1)); fi
}

# 1. API viva.
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$API_URL/api/readyz" || echo 000)
check "API readyz" "$([ "$code" = "200" ] && echo 1 || echo 0)" "HTTP $code"

# 2. Cron periódico: el catálogo que sincroniza debe tener actividad reciente
#    dentro del umbral de frescura configurado.
feed_json=$(curl -s --max-time 30 "$API_URL$FEED_PATH" || echo "")
feed_fresh=$(FEED_TIME_FIELD="$FEED_TIME_FIELD" FRESHNESS_THRESHOLD_HOURS="$FRESHNESS_THRESHOLD_HOURS" python3 - "$feed_json" <<'PY'
import json, os, sys, time

raw = sys.argv[1]
fields = [f.strip() for f in os.environ.get("FEED_TIME_FIELD", "time").split(",") if f.strip()]
threshold_ms = float(os.environ.get("FRESHNESS_THRESHOLD_HOURS", "24")) * 3600 * 1000

try:
    data = json.loads(raw)
    items = data if isinstance(data, list) else (data.get("items") or [])
    newest = 0
    for item in items:
        for field in fields:
            v = item.get(field)
            if isinstance(v, (int, float)) and v > newest:
                newest = v
                break
    print(1 if newest and (time.time() * 1000 - newest) < threshold_ms else 0)
except Exception:
    print(0)
PY
)
check "cron periódico (feed <${FRESHNESS_THRESHOLD_HOURS}h)" "$feed_fresh" "última entrada fresca: $feed_fresh"

# 3. Cartas muertas (si hay doppler configurado con un proyecto real): deben
#    ser 0 en régimen normal. Consulta de SOLO LECTURA sobre audit_log — el
#    consumidor de colas persiste ahí toda carta muerta (acción
#    "queue.dead_letter"), así que un valor >0 significa un job que agotó
#    reintentos sin que nadie lo haya investigado todavía.
if [ "$DOPPLER_PROJECT" = "<tu-proyecto-doppler>" ]; then
  echo "INFO  cartas muertas — DOPPLER_PROJECT no configurado (sigue en el placeholder), check omitido"
elif ! command -v doppler >/dev/null 2>&1; then
  echo "INFO  cartas muertas — sin \`doppler\` en PATH, check omitido"
else
  dlq=$(doppler run -p "$DOPPLER_PROJECT" -c "$DOPPLER_CONFIG" -- sh -c '
    node -e "
      const { Pool } = require(process.env.PWD + \"/backend/node_modules/pg\");
      (async () => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: { rejectUnauthorized: false } });
        const r = await pool.query(\"select count(*)::int as n from audit_log where action = '\''queue.dead_letter'\''\");
        console.log(r.rows[0].n); await pool.end();
      })().catch(() => console.log(\"ERR\"));
    "' 2>/dev/null | tail -1)
  if [ "$dlq" = "ERR" ] || [ -z "$dlq" ]; then
    check "cartas muertas (audit_log)" 0 "no se pudo consultar"
  else
    check "cartas muertas (audit_log)" "$([ "$dlq" = "0" ] && echo 1 || echo 0)" "$dlq registradas (investigar en Auditoría del panel admin si >0)"
  fi
fi

if [ "$FALLOS" = "0" ]; then echo "VEREDICTO: verde"; else echo "VEREDICTO: $FALLOS fallo(s)"; exit 1; fi
