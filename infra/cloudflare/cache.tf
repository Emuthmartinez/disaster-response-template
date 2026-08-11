# Cache Rules del CDN (superficie pública).
#
# El cache es la defensa más barata contra un pico de tráfico: cada respuesta
# servida desde el borde es una petición que el origen no ve. En una
# emergencia el tráfico es en su mayoría lectura de las mismas páginas, así
# que esto importa más que casi cualquier otra regla de este módulo.
#
# ─────────────────────────────────────────────────────────────────────────
# ⚠️  AVISO: ESTO ES UN NO-OP SI TU ORIGEN ES UN WORKER EN UN CUSTOM DOMAIN.
#
# Las Cache Rules de zona (`http_request_cache_settings`, este archivo) solo
# actúan sobre tráfico que llega a un origen "clásico" detrás del proxy
# naranja — el VPS de este template, vía los A/CNAME proxied de `dns.tf`.
# Si en algún momento migras el frontend o la API a un Cloudflare Worker
# con custom domain (arquitectura alternativa, no la que usa este template
# por defecto), el Worker se ejecuta ANTES de la fase de cache de zona:
# ninguna regla de aquí le aplica, ninguna respuesta suya llevará la
# cabecera `cf-cache-status`, y lo confirmarás con `curl -sI` sin verla. Un
# despliegue real de ese tipo lo verificó en vivo: cero efecto sobre las
# respuestas de un Worker en `api.*` una vez migrado, con estas mismas
# reglas aplicadas y sin errores.
#
# La solución en ese escenario NO es esta capa: es cachear DENTRO del propio
# Worker con el binding `caches.default` (Cache API estándar de Workers,
# `event.request` + `caches.default.match()/.put()`). Si migras a Workers,
# mueve esta lógica de cache al código del Worker en vez de asumir que este
# archivo sigue haciendo algo — y confírmalo con verify-settings.sh o un
# `curl -sI` real antes de darlo por bueno.
# ─────────────────────────────────────────────────────────────────────────

resource "cloudflare_ruleset" "cache_rules" {
  zone_id     = var.zone_id
  name        = "Cache rules canónicos"
  description = "Cache agresivo para assets inmutables y fotos/objetos; bypass para APIs y admin."
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      # La API sirve contenido dinámico (mapas de reportes, estado de
      # personas). Cachearla mostraría información desactualizada sobre
      # gente desaparecida.
      description = "Bypass cache en API"
      expression  = "(http.host eq \"${var.api_hostname}\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
      enabled = true
    },
    {
      description = "Bypass cache en admin (BFF con cookies de sesión)"
      expression  = "(http.host eq \"${var.admin_hostname}\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
      enabled = true
    },
    {
      # _next/static lleva hash de contenido en el nombre: es inmutable.
      description = "Cache agresivo para _next/static/* (content-hashed)"
      expression  = "(starts_with(http.request.uri.path, \"/_next/static/\"))"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 31536000
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 31536000
        }
      }
      enabled = true
    },
    {
      description = "Cache moderado para fotos/objetos en r2_public_hostname"
      expression  = "(http.host eq \"${var.r2_public_hostname}\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 604800
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 604800
        }
      }
      enabled = true
    },
  ]
}
