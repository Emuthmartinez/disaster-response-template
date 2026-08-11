#!/usr/bin/env bash
# Verifica el estado de Turnstile en un despliegue, EN EL ORDEN QUE IMPORTA.
#
# LECCIÓN (por qué existe este script, no solo "correr curl a mano"): en un
# despliegue de referencia, Turnstile se desactivó en producción porque el
# bundle del frontend no llevaba la site key pública mientras el backend SÍ
# exigía el token — resultado: el 100% de los envíos del formulario protegido
# fallaban con 403. La regla que este script hace cumplir:
#
#   1. la site key llega al bundle del frontend (verificable)
#   2. DESPUÉS, y solo después, se repone el secreto en el backend
#
# En ese orden. Correr este script antes de tocar el secreto del backend evita
# repetir el fallo.
#
# Uso:
#   scripts/verify-turnstile.sh staging
#   scripts/verify-turnstile.sh production
#   WEB_URL=https://mi-front.example FORM_PAGE=/mi-form scripts/verify-turnstile.sh production
#
# Toda URL es sobreescribible por variable de entorno — los defaults de abajo
# son ejemplo.org, obviamente falsos, para que este script sea copiable a
# cualquier despliegue del template sin editar el archivo:
#
#   WEB_URL           Origin del frontend público (default por entorno abajo)
#   API_URL            Origin del backend/API (default por entorno abajo)
#   FORM_PAGE          Ruta de una página que MONTA un formulario protegido por
#                      Turnstile. IMPORTANTE: no vale escanear el home — con el
#                      chunking por ruta de Turbopack/Next, el chunk del hook de
#                      Turnstile solo se sirve en páginas que montan el widget,
#                      así que escanear una página sin formulario da un FALSO
#                      NEGATIVO aunque la site key esté perfectamente inlineada
#                      en el build. Default: la página de solicitud de
#                      eliminación de datos que el template ya trae
#                      (/solicitar-borrado) — cualquier otra ruta con
#                      <TurnstileWidget/> sirve igual de bien.
#   PROBE_PATH         Endpoint del backend protegido por requireHuman, para el
#                      paso 2 (default /api/missing — reporte público).
#   MAX_WAIT_SECONDS    Tolerancia de propagación tras pushear un secreto
#                      (default 60). `wrangler secret bulk` / un redeploy del
#                      Worker no está activo en TODOS los PoPs de Cloudflare de
#                      forma instantánea; una sola sonda justo después de
#                      pushear puede pillar un isolate desactualizado.
#   POLL_INTERVAL_SECONDS  Espera entre sondas del paso 2 (default 10).
#
# No escribe nada: la sonda del paso 2 manda un cuerpo vacío, que el
# middleware rechaza (403 si Turnstile está activo) o el validador rechaza
# (400/422 si no lo está) — en ningún caso llega a insertar una fila.

set -euo pipefail

ENVIRONMENT="${1:-staging}"

case "$ENVIRONMENT" in
  staging)
    WEB_URL="${WEB_URL:-https://staging.mapa.example.org}"
    API_URL="${API_URL:-https://api-staging.mapa.example.org}"
    ;;
  production|prod)
    WEB_URL="${WEB_URL:-https://mapa.example.org}"
    API_URL="${API_URL:-https://api.mapa.example.org}"
    ;;
  *)
    echo "Uso: $0 [staging|production]" >&2
    echo "  (o exporta WEB_URL/API_URL directamente y pasa cualquier primer argumento)" >&2
    exit 2
    ;;
esac

FORM_PAGE="${FORM_PAGE:-/solicitar-borrado}"
PROBE_PATH="${PROBE_PATH:-/api/missing}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-60}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-10}"

echo "Entorno: $ENVIRONMENT"
echo "  web:        $WEB_URL"
echo "  api:        $API_URL"
echo "  form page:  $FORM_PAGE"
echo "  probe path: $PROBE_PATH"
echo

# --- Paso 1: ¿la site key está inlineada en el bundle? -----------------------
# El hook de Turnstile lee NEXT_PUBLIC_TURNSTILE_SITE_KEY en BUILD TIME. Si no
# estaba disponible al construir, el valor queda vacío y el widget nunca
# monta — da igual lo que haya configurado en runtime/Doppler.

echo "== Paso 1: site key en el bundle del frontend =="
FORM_URL="$WEB_URL$FORM_PAGE"
html="$(curl -fsS -m 25 "$FORM_URL" || true)"
if [ -z "$html" ]; then
  echo "  ERROR: no se pudo cargar $FORM_URL"
  exit 1
fi

chunks="$(printf '%s' "$html" \
  | grep -oE '/_next/static/chunks/[a-zA-Z0-9_.\-]+\.js' \
  | sort -u)"

# La key puede venir inlineada en el HTML del server render, sin bajar chunks.
# El prefijo `0x4AAA` es el formato público y estable de toda site key de
# Turnstile — no es un secreto de este despliegue.
inline="$(printf '%s' "$html" | grep -oE '0x4AAA[A-Za-z0-9_-]+' | head -1 || true)"

sitekey=""
if [ -n "$inline" ]; then
  sitekey="$inline"
  echo "  OK: site key encontrada en el HTML de $FORM_URL"
  echo "      $sitekey"
fi
for c in $chunks; do
  [ -n "$sitekey" ] && break
  body="$(curl -fsS -m 20 "$WEB_URL$c" || true)"
  found="$(printf '%s' "$body" | grep -oE '0x4AAA[A-Za-z0-9_-]+' | head -1 || true)"
  if [ -n "$found" ]; then
    sitekey="$found"
    echo "  OK: site key encontrada en $c"
    echo "      $sitekey"
    break
  fi
done

if [ -z "$sitekey" ]; then
  echo "  FALTA: ninguna site key de Turnstile en los $(printf '%s\n' "$chunks" | grep -c .) chunks escaneados de $FORM_URL."
  echo "         => NEXT_PUBLIC_TURNSTILE_SITE_KEY no llegó al build, o FORM_PAGE no monta el widget."
  echo "         NO repongas el secreto del backend todavía: romperías las escrituras."
fi
echo

# --- Paso 2: ¿la API exige el token, y con la FORMA de error correcta? -------
# Cuerpo vacío a propósito: requireHuman corre ANTES del handler, así que un
# 403 aquí nunca inserta nada. Pero un 403 por sí solo NO basta como prueba:
# un WAF, Cloudflare Access, o cualquier proxy intermedio también puede
# devolver 403 con una página HTML de bloqueo que no tiene nada que ver con
# Turnstile. Este script exige además que el BODY sea JSON con la forma propia
# del backend ({"error": "..."}) y que el mensaje sea el de requireHuman
# específicamente — así "403 con curl" no se confunde con "Turnstile activo".
#
# Se sondea en un bucle de hasta MAX_WAIT_SECONDS: justo después de pushear un
# secreto nuevo al Worker, no todos los edge PoPs sirven la versión nueva de
# inmediato, así que una sola sonda puede dar un resultado transitorio. Se
# exige el MISMO resultado dos sondas seguidas antes de darlo por asentado.

echo "== Paso 2: ¿la API exige prueba de humanidad, con el error propio del backend? =="

probe_once() {
  # Escribe "<code>\t<body>" a stdout.
  local code body tmp
  tmp="$(mktemp)"
  code="$(curl -s -m 25 -o "$tmp" -w '%{http_code}' \
    -X POST "$API_URL$PROBE_PATH" \
    -H 'content-type: application/json' \
    --data '{}' || true)"
  body="$(cat "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"
  printf '%s\t%s' "$code" "$body"
}

# Clasifica una respuesta (code + body) en:
#   1  -> Turnstile ACTIVO y confirmado (403 + body JSON con el mensaje propio
#         de requireHuman, no un 403 genérico de otra capa)
#   0  -> Turnstile INACTIVO (400/422 con body JSON del validador zod)
#  -1  -> indeterminado (429, timeout, 403 con forma de body ajena, etc.)
classify() {
  local code="$1" body="$2" err_field
  err_field="$(printf '%s' "$body" | grep -oE '"error"\s*:\s*"[^"]*"' || true)"
  case "$code" in
    403)
      if printf '%s' "$err_field" | grep -qiE 'anti-?bot|turnstile|verificaci[oó]n'; then
        echo 1
      else
        echo -1
      fi
      ;;
    400|422)
      if [ -n "$err_field" ]; then echo 0; else echo -1; fi
      ;;
    429) echo -1 ;;
    *) echo -1 ;;
  esac
}

elapsed=0
prev=""
settled=""
while :; do
  result="$(probe_once)"
  code="${result%%$'\t'*}"
  body="${result#*$'\t'}"
  state="$(classify "$code" "$body")"

  case "$state" in
    1) label="ACTIVO (403, error propio de requireHuman confirmado)" ;;
    0) label="INACTIVO (400/422, error propio del validador)" ;;
    *) label="indeterminado (HTTP $code)" ;;
  esac
  echo "  [$(printf '%3ds' "$elapsed")] $label"

  if [ "$state" = "$prev" ] && [ "$state" != "-1" ]; then
    settled="$state"
    break
  fi
  prev="$state"

  elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    settled="$state"
    echo "  (se agotó la tolerancia de ${MAX_WAIT_SECONDS}s sin dos sondas iguales seguidas; usando la última lectura)"
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

backend_on="$settled"
echo

# --- Veredicto ---------------------------------------------------------------
echo "== Veredicto =="
if [ -n "$sitekey" ] && [ "$backend_on" = "1" ]; then
  echo "  COHERENTE: frontend y backend con Turnstile activo."
elif [ -z "$sitekey" ] && [ "$backend_on" = "0" ]; then
  echo "  COHERENTE (desactivado en ambos lados). Estado actual conocido."
  echo "  Siguiente paso: poner NEXT_PUBLIC_TURNSTILE_SITE_KEY en tu gestor de"
  echo "  secretos, redesplegar el frontend, volver a correr este script, y SOLO"
  echo "  SI el paso 1 pasa, reponer el secreto del backend (TURNSTILE_SECRET_KEY)."
elif [ -n "$sitekey" ] && [ "$backend_on" = "0" ]; then
  echo "  LISTO PARA EL PASO FINAL: el bundle ya lleva la site key y el backend"
  echo "  aún no exige el token. Ahora sí es seguro reponer TURNSTILE_SECRET_KEY."
elif [ -z "$sitekey" ] && [ "$backend_on" = "1" ]; then
  echo "  ROTO: el backend exige token y el frontend no lo puede generar."
  echo "  Este es exactamente el fallo que puede tumbar un formulario público"
  echo "  entero. Quita TURNSTILE_SECRET_KEY del backend YA, o repón la site key"
  echo "  del frontend y redespliega."
  exit 1
else
  echo "  INDETERMINADO — revisa los pasos de arriba (HTTP inesperado, red, o"
  echo "  un 403 que no tiene la forma de error propia del backend — puede ser"
  echo "  otra capa, p.ej. un WAF o un proxy de borde, no Turnstile)."
fi
