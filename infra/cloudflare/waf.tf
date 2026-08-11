# Cloudflare Managed Rulesets (WAF).
#
# AVISO DE PLAN: en el plan Free solo está disponible el "Cloudflare Free
# Managed Ruleset". Los rulesets OWASP Core y Exposed Credentials requieren
# Pro o superior — si la zona sigue en Free, `tofu apply` FALLARÁ en esas dos
# reglas con un 400 "not entitled to execute this managed ruleset". Deja
# enable_paid_rulesets = false hasta que confirmes que la zona subió de plan.

variable "enable_paid_rulesets" {
  description = "true solo si la zona está en plan Pro+. En Free, OWASP Core y Exposed Credentials no existen y el apply falla con 400."
  type        = bool
  default     = false
}

locals {
  # LECCIÓN DE LANZAMIENTO: si portas este módulo (o cualquier módulo de
  # Cloudflare ajeno) desde un despliegue en plan Pro+, es fácil arrastrar
  # el ID de ESE ruleset sin darte cuenta de que no existe en Free — un caso
  # real vio el ID efb7b8c949ac4650a09736fc376e9aee (el "Cloudflare Managed
  # Ruleset" de Pro+) copiado tal cual a una zona Free, y la API lo rechazó
  # con 400 en cada apply.
  #
  # El ID de abajo es el ruleset gratuito correcto, confirmado contra
  # GET /zones/{id}/rulesets?kind=managed sobre una zona Free real. Si
  # Cloudflare lo cambia en el futuro, la misma llamada te da el ID vigente.
  managed_ruleset_free = {
    description = "Cloudflare Managed Free Ruleset"
    expression  = "true"
    action      = "execute"
    action_parameters = {
      id = "77454fe2d30c4220b5701f6fdfb893ba"
    }
    enabled = true
  }

  managed_rulesets_paid = [
    {
      description = "Cloudflare OWASP Core Ruleset"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "4814384a9e5d4991b9815dcfc25d2f1f"
      }
      enabled = true
    },
    {
      description = "Cloudflare Exposed Credentials Check"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "c2e184081120413c86c3ab7e14069605"
      }
      enabled = true
    },
  ]
}

resource "cloudflare_ruleset" "managed_waf" {
  zone_id     = var.zone_id
  name        = "Managed WAF entrypoint"
  description = "Enlaza los rulesets gestionados de Cloudflare a la zona."
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = concat(
    [local.managed_ruleset_free],
    var.enable_paid_rulesets ? local.managed_rulesets_paid : [],
  )
}
