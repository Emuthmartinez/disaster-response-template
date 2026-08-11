#!/usr/bin/env bash
# Verifica en vivo, contra la API de Cloudflare, que los ajustes críticos de
# seguridad de este módulo REALMENTE tomaron efecto.
#
# LECCIÓN DE LANZAMIENTO: `tofu apply` puede reportar "Apply complete!" en un
# ajuste que la API sigue sirviendo sin cambiar. Pasó de verdad con HSTS: el
# provider decía éxito y `GET /zones/{id}/settings/security_header` seguía
# devolviendo `enabled: false` hasta un PATCH manual directo contra la API.
# El exit code 0 de `tofu apply` NO es prueba de que un ajuste esté
# realmente activo — hay que preguntarle a la API, no al plan. Este script
# es esa pregunta, automatizada, para que no dependa de que alguien se
# acuerde de hacerla a mano después de cada apply.
#
# Uso:
#   export CLOUDFLARE_API_TOKEN=...   # token de ZONA (ver README)
#   export CLOUDFLARE_ZONE_ID=...     # el mismo valor que zone_id en terraform.tfvars
#   ./verify-settings.sh
#
# Si tus terraform.tfvars usan valores distintos de los defaults de abajo
# (p.ej. ya pasaste a ssl_mode = "strict" o encendiste bot_fight_mode),
# dile al script qué esperar:
#
#   EXPECTED_SSL_MODE=strict EXPECTED_BOT_FIGHT_MODE=true ./verify-settings.sh
#
# Requiere: curl, jq.

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Falta CLOUDFLARE_API_TOKEN (token de ZONA: DNS/settings/rulesets/DNSSEC — ver README, 'Permisos del token'). Ejecuta esto bajo tu gestor de secretos o expórtalo a mano.}"
: "${CLOUDFLARE_ZONE_ID:?Falta CLOUDFLARE_ZONE_ID. Es el mismo valor que zone_id en terraform.tfvars.}"

command -v jq >/dev/null 2>&1 || {
  echo "Falta jq. Instálalo (brew install jq / apt install jq) y reintenta." >&2
  exit 2
}

EXPECTED_SSL_MODE="${EXPECTED_SSL_MODE:-full}"
EXPECTED_BOT_FIGHT_MODE="${EXPECTED_BOT_FIGHT_MODE:-false}"
EXPECTED_HSTS_ENABLED="${EXPECTED_HSTS_ENABLED:-true}"
EXPECTED_DNSSEC_STATUS="${EXPECTED_DNSSEC_STATUS:-active}"

API="https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
fail=0

# Llama a la API y valida el sobre `success` de Cloudflare antes de mirar el
# contenido — así un 403 por token equivocado (p.ej. pasaste el token de
# CUENTA en vez del de ZONA) se reporta como lo que es, no como "el ajuste
# está mal".
api_get() {
  local path="$1" response ok
  response=$(curl -s -H "$AUTH_HEADER" "$API$path")
  ok=$(echo "$response" | jq -r '.success // false')
  if [[ "$ok" != "true" ]]; then
    echo "ERROR llamando a ${path}:" >&2
    echo "$response" | jq -r '.errors[]? | "  \(.code): \(.message)"' >&2
    echo "Revisa que CLOUDFLARE_API_TOKEN sea el token de ZONA (no el de cuenta) y tenga los permisos de la sección 'Permisos del token' del README." >&2
    exit 2
  fi
  echo "$response"
}

check() {
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "OK    ${name} = ${actual}"
  else
    echo "FALLO ${name} = ${actual} (se esperaba ${expected})"
    fail=1
  fi
}

echo "== Verificando zona ${CLOUDFLARE_ZONE_ID} contra la API de Cloudflare =="
echo

# --- SSL mode -----------------------------------------------------------
ssl_value=$(api_get "/settings/ssl" | jq -r '.result.value')
check "ssl_mode" "$ssl_value" "$EXPECTED_SSL_MODE"

# --- HSTS -----------------------------------------------------------------
# Este es el que falló en silencio en producción una vez — ver la nota en
# settings.tf. No te fíes de que "siempre funciona": es justo el que hay que
# comprobar.
hsts_enabled=$(api_get "/settings/security_header" | jq -r '.result.value.strict_transport_security.enabled')
check "hsts_enabled" "$hsts_enabled" "$EXPECTED_HSTS_ENABLED"

# --- Bot management (Bot Fight Mode) ---------------------------------------
# OJO: esto NO es un zone setting (ver settings.tf) — vive en su propio
# endpoint, /bot_management.
bot_fight_mode=$(api_get "/bot_management" | jq -r '.result.fight_mode')
check "bot_fight_mode" "$bot_fight_mode" "$EXPECTED_BOT_FIGHT_MODE"

# --- DNSSEC -----------------------------------------------------------------
dnssec_status=$(api_get "/dnssec" | jq -r '.result.status')
check "dnssec_status" "$dnssec_status" "$EXPECTED_DNSSEC_STATUS"
if [[ "$dnssec_status" == "pending" ]]; then
  echo "NOTA  DNSSEC en 'pending' es normal hasta que publiques el registro DS en el panel de tu registrador (ver README, sección DNSSEC). No es, por sí solo, un fallo de este módulo."
fi

echo
echo "======================================"
if [[ "$fail" -eq 0 ]]; then
  echo "Todos los ajustes verificados coinciden con lo esperado."
  exit 0
else
  echo "Uno o más ajustes NO coinciden con lo esperado (arriba, FALLO)."
  echo "'tofu apply' saliendo con éxito no es prueba de que un ajuste tomó efecto — confía en esta verificación contra la API, no en el exit code de tofu."
  exit 1
fi
