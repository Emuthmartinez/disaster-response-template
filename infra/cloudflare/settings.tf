# Settings globales de la zona. Sustituyen la configuración manual del panel.

# ---------------------------------------------------------------------------
# TENSIÓN DE DISEÑO: endurecer vs. dejar entrar a la gente
#
# En un sitio de emergencia el usuario típico está en un móvil de gama baja,
# con datos móviles intermitentes, posiblemente compartiendo una IP NAT con
# miles de personas, y buscando si un familiar está vivo. Los controles
# anti-bot de Cloudflare (Bot Fight Mode, Browser Integrity Check,
# security_level alto) resuelven un reto JS antes de servir la página. Eso:
#   - falla o tarda muchísimo en conexiones malas
#   - rompe clientes de API y lectores de pantalla antiguos
#   - castiga IPs compartidas (NAT de operadoras móviles)
#
# Por eso van como variables y no fijos: si el sitio está bajo ataque se
# suben, y si hay quejas de acceso se bajan sin tocar código.
# ---------------------------------------------------------------------------

variable "bot_fight_mode" {
  description = "Bot Fight Mode. Protege contra scraping, pero reta con un script inyectado a TODO cliente, incluidos los legítimos en redes malas. Ver nota de diseño arriba."
  type        = bool
  # APAGADO POR DEFECTO. LECCIÓN DE LANZAMIENTO: al activarlo (enable_js =
  # true, ver el recurso cloudflare_bot_management más abajo), Cloudflare
  # inyecta su script de detección de bots en el HTML servido. Si el
  # frontend sirve una CSP estricta (script-src sin el host que sirve ese
  # script), el navegador lo bloquea él solo y la consola se llena de
  # violaciones de CSP — en un despliegue real esto rompió páginas en
  # producción hasta diagnosticarlo. Antes de poner esto en true: activa
  # Bot Fight Mode en staging, mira qué origen bloquea tu CSP en la consola
  # del navegador, y añádelo al script-src del frontend primero.
  default = false
}

variable "browser_integrity_check" {
  description = "Bloquea peticiones con cabeceras/User-Agent sospechosos. Puede bloquear navegadores muy antiguos o clientes de API legítimos con UA atípico."
  type        = bool
  default     = true
}

variable "security_level" {
  description = "Nivel de seguridad del borde: essentially_off | low | medium | high | under_attack. 'under_attack' reta a TODO el mundo — usar solo durante un ataque activo y confirmado."
  type        = string
  default     = "medium"

  validation {
    condition     = contains(["essentially_off", "low", "medium", "high", "under_attack"], var.security_level)
    error_message = "security_level inválido."
  }
}

variable "hsts_preload" {
  description = "Anunciar preload en HSTS. OJO: enviar preload y darse de alta en la lista de precarga de Chrome es difícil de revertir y fuerza HTTPS en TODOS los subdominios para siempre, incluidos los que aún no existen."
  type        = bool
  default     = true
}

# --- TLS --------------------------------------------------------------------
# ORDEN IMPORTANTE. "strict" exige que el origen presente un certificado
# válido ANTES de activarlo, o el sitio devuelve 526 para todo el mundo.
#
# Además hay una trampa: con `always_use_https = on`, Cloudflare responde 301
# al reto HTTP-01 de Let's Encrypt antes de que llegue a Caddy, así que el
# origen nunca consigue emitir su propio certificado mientras el registro ya
# esté proxied. Dos salidas:
#   a) usar un Cloudflare Origin CA cert (no necesita ACME) — recomendado,
#      ver el snippet `cf_origin_tls` comentado en Caddyfile.example
#   b) emitir el cert con el registro en gris (DNS only) y proxiar después
#
# Por eso el valor por defecto es "full": el primer despliegue no se
# bloquea. Pasar a "strict" solo cuando el origen ya sirva su certificado.
variable "ssl_mode" {
  description = "Modo SSL del borde: off | flexible | full | strict. Empezar en 'full'; pasar a 'strict' cuando el origen tenga certificado — ver aviso arriba."
  type        = string
  default     = "full"

  validation {
    condition     = contains(["off", "flexible", "full", "strict"], var.ssl_mode)
    error_message = "ssl_mode debe ser off, flexible, full o strict."
  }
}

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.zone_id
  setting_id = "ssl"
  value      = var.ssl_mode
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "tls_1_3" {
  zone_id    = var.zone_id
  setting_id = "tls_1_3"
  value      = "on"
}

resource "cloudflare_zone_setting" "opportunistic_encryption" {
  zone_id    = var.zone_id
  setting_id = "opportunistic_encryption"
  value      = "on"
}

resource "cloudflare_zone_setting" "automatic_https_rewrites" {
  zone_id    = var.zone_id
  setting_id = "automatic_https_rewrites"
  value      = "on"
}

# --- Anti-abuso -------------------------------------------------------------
resource "cloudflare_zone_setting" "browser_check" {
  zone_id    = var.zone_id
  setting_id = "browser_check"
  value      = var.browser_integrity_check ? "on" : "off"
}

resource "cloudflare_zone_setting" "security_level" {
  zone_id    = var.zone_id
  setting_id = "security_level"
  value      = var.security_level
}

resource "cloudflare_zone_setting" "challenge_ttl" {
  zone_id    = var.zone_id
  setting_id = "challenge_ttl"
  value      = 1800
}

# Bot Fight Mode NO es un zone setting: la API responde
# 1006 "Unrecognized zone setting name: bfm" si lo intentas como tal. Vive en
# su propio endpoint, /zones/{id}/bot_management — un módulo portado de otro
# despliegue que lo modele como zone setting fallará con ese 1006 en cada
# apply.
#
# enable_js es obligatorio: la API rechaza fight_mode con
# "cannot enable Fight_Mode while EnableJS is disabled".
resource "cloudflare_bot_management" "this" {
  zone_id    = var.zone_id
  fight_mode = var.bot_fight_mode
  enable_js  = var.bot_fight_mode
}

# --- HSTS -------------------------------------------------------------------
# Duplica a propósito la cabecera que ya debería enviar tu origen (Caddy con
# `security_headers` en Caddyfile.example, o el framework de tu backend):
# defensa en profundidad. Si el origen se cae o se despliega mal, el borde
# sigue anunciando HSTS.
#
# LECCIÓN DE LANZAMIENTO: un `tofu apply` puede reportar éxito en este
# recurso mientras la API de Cloudflare sigue devolviendo `enabled: false`
# en `GET /zones/{id}/settings/security_header` — pasó en un despliegue
# real. El exit code de `tofu apply` NO es prueba de que HSTS esté
# realmente activo; corre `verify-settings.sh` después de aplicar y confía
# en lo que dice la API, no en el plan.
resource "cloudflare_zone_setting" "security_header" {
  zone_id    = var.zone_id
  setting_id = "security_header"
  value = jsonencode({
    strict_transport_security = {
      enabled            = true
      max_age            = 63072000
      include_subdomains = true
      preload            = var.hsts_preload
      nosniff            = true
    }
  })
}

# --- Rendimiento en redes malas --------------------------------------------
# Brotli reduce bytes en móvil; HTTP/3 acelera reconexiones en redes con
# pérdida de paquetes, que es exactamente el perfil de red de una zona
# afectada por un desastre.
resource "cloudflare_zone_setting" "brotli" {
  zone_id    = var.zone_id
  setting_id = "brotli"
  value      = "on"
}

# 0-RTT: DESACTIVADO A PROPÓSITO POR AHORA.
#
# LECCIÓN DE LANZAMIENTO: Cloudflare acepta el PATCH (devuelve success +
# value "on") pero lo revierte a "off" poco después, incluso serializándolo
# tras tls_1_3 con depends_on. La causa más probable es que la zona todavía
# no tiene ningún registro proxied: no hay hostname en el borde al que
# aplicar una optimización de handshake TLS.
#
# Dejarlo declarado hace que CADA `tofu plan` muestre el mismo cambio para
# siempre, y un plan que nunca sale limpio esconde los cambios que sí
# importan. Descoméntalo cuando la zona tenga al menos un registro proxied
# real (después de rellenar origin_ip en terraform.tfvars y aplicar dns.tf).
#
# resource "cloudflare_zone_setting" "zero_rtt" {
#   zone_id    = var.zone_id
#   setting_id = "0rtt"
#   value      = "on"
#   depends_on = [cloudflare_zone_setting.tls_1_3]
# }

resource "cloudflare_zone_setting" "http3" {
  zone_id    = var.zone_id
  setting_id = "http3"
  value      = "on"
}

# Always Online sirve una copia cacheada (Internet Archive) si el origen se
# cae. Para un sitio de emergencia, una página desactualizada es mejor que
# un 522.
resource "cloudflare_zone_setting" "always_online" {
  zone_id    = var.zone_id
  setting_id = "always_online"
  value      = "on"
}
