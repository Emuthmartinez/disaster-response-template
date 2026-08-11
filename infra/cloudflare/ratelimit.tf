# Rate limiting por endpoint sensible en la superficie pública.
#
# Complementa el rate-limit del propio backend (ver `backend/src/lib/rate-
# limit.ts` o equivalente). Este es el BORDE: si Cloudflare devuelve 429, la
# petición nunca llega al origen — protege a un VPS pequeño durante un pico
# de tráfico sin que gaste sus propios recursos en rechazarla.
#
# AVISO DE PLAN: el plan Free incluye UNA sola regla de rate limiting y solo
# con periodo de 10s. El resto requiere Pro+. Con `free_plan_mode = true` se
# aplica únicamente la regla más crítica (escritura de contenido público).
#
# Los paths de abajo son los routers montados en `backend/src/server.ts` /
# `backend/src/public-api/index.ts` de ESTE template: /api/missing,
# /api/reports, /api/contact, /api/donations, /api/needs, /api/chat,
# /api/admin/login, /api/public/auth/*. Si tu fork renombra, quita o añade
# endpoints públicos de escritura, actualiza esta lista — Cloudflare no los
# descubre solo, y un endpoint nuevo sin regla aquí queda protegido
# únicamente por el rate-limit del propio backend (si lo tiene).

variable "free_plan_mode" {
  description = "true = aplicar solo 1 regla de rate limit (límite del plan Free)."
  type        = bool
  default     = true
}

locals {
  # Plan Free: la API solo acepta period = 10 ("not entitled to use the
  # period 60, can only use a period among [10]"). 5 peticiones / 10s ~=
  # 30/min, que es el límite que se busca, expresado en la única ventana
  # disponible en Free.
  rl_content_write = {
    description = "Publicación de contenido público (5/10s por IP y colo)"
    expression  = "(http.host eq \"${var.api_hostname}\" and (http.request.uri.path eq \"/api/missing\" or http.request.uri.path eq \"/api/reports\" or http.request.uri.path eq \"/api/contact\" or http.request.uri.path eq \"/api/donations\" or http.request.uri.path eq \"/api/needs\" or http.request.uri.path eq \"/api/chat\") and http.request.method eq \"POST\")"
    action      = "block"
    ratelimit = {
      # cf.colo.id es OBLIGATORIO: la API rechaza ["ip.src"] a secas con
      # 20155 "ratelimiting counting is processed at colocation level
      # only". Efecto práctico: el contador es por IP Y POR centro de
      # datos, así que el límite real es algo más permisivo de lo que
      # sugiere el número — no lo bajes esperando un límite global estricto.
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
    enabled = true
  }

  rl_paid = [
    {
      description = "Login admin (5/min por IP)"
      expression  = "(http.host eq \"${var.api_hostname}\" and http.request.uri.path eq \"/api/admin/login\" and http.request.method eq \"POST\")"
      action      = "block"
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 60
        requests_per_period = 5
        mitigation_timeout  = 600
      }
      enabled = true
    },
    {
      description = "Auth pública (login/reset) (10/min por IP)"
      expression  = "(http.host eq \"${var.api_hostname}\" and starts_with(http.request.uri.path, \"/api/public/auth/\") and http.request.method eq \"POST\")"
      action      = "block"
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 60
        requests_per_period = 10
        mitigation_timeout  = 300
      }
      enabled = true
    },
  ]
}

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "Rate limits sensibles"
  description = "Rate limits por endpoint en la superficie pública."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = concat(
    [local.rl_content_write],
    var.free_plan_mode ? [] : local.rl_paid,
  )
}
