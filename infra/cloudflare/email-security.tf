# Seguridad de correo / anti-suplantación.
#
# URGENTE Y INDEPENDIENTE DEL SERVIDOR. Una zona vacía no es neutral: es
# permisiva. Sin SPF/DMARC cualquiera puede enviar correo como
# `donaciones@<tu-dominio>` y el receptor no tiene política contra la que
# contrastar. En un dominio de catástrofe el fraude de donaciones por correo
# suplantado es el vector de abuso más probable, y estos registros se pueden
# aplicar HOY, antes de que exista el sitio o el código.
#
# Por defecto (email_enabled = false, cloudflare_email_routing = false) el
# dominio queda cerrado a correo:
#   - null MX (RFC 7505): no acepta correo entrante
#   - SPF -all: ningún servidor está autorizado a enviar en su nombre
#   - DMARC p=reject: el receptor debe rechazar lo que falle
#   - DKIM nulo en wildcard: ninguna clave DKIM es válida

# Si activas Cloudflare Email Routing (reenvío de correo entrante) desde el
# panel de Cloudflare, sus registros MX (route*.mx.cloudflare.net) los
# gestiona el propio producto, NO este módulo. Con routing activo, el null
# MX y el SPF nulo dejan de aplicar: el dominio SÍ acepta correo y el SPF
# debe autorizar el reenvío de Cloudflare, o el correo reenviado falla SPF
# en destino. Pon esta variable en true DESPUÉS de activar Email Routing en
# el panel, para que este módulo deje de pelearse con esos registros.
variable "cloudflare_email_routing" {
  description = "true = la zona usa Cloudflare Email Routing (los MX de entrada los define Cloudflare). Suprime el null MX de este módulo y usa el SPF de Cloudflare en vez de -all."
  type        = bool
  default     = false
}

locals {
  # Ordenado de más a menos restrictivo según proveedor.
  spf_record = var.email_enabled ? (
    var.mail_provider == "hostinger" ? "v=spf1 include:_spf.mail.hostinger.com -all" :
    var.mail_provider == "google" ? "v=spf1 include:_spf.google.com -all" :
    "v=spf1 -all"
    ) : (
    var.cloudflare_email_routing ? "v=spf1 include:_spf.mx.cloudflare.net ~all" : "v=spf1 -all"
  )

  dmarc_record = join("; ", compact([
    "v=DMARC1",
    "p=${var.dmarc_policy}",
    "sp=${var.dmarc_policy}",
    var.dmarc_rua != "" ? "rua=mailto:${var.dmarc_rua}" : "",
    "adkim=s",
    "aspf=s",
    "fo=1",
    "pct=100",
  ]))

  mx_hostinger = {
    "mx1.hostinger.com" = 5
    "mx2.hostinger.com" = 10
  }

  mx_google = {
    "smtp.google.com" = 1
  }

  active_mx = var.email_enabled ? (
    var.mail_provider == "hostinger" ? local.mx_hostinger :
    var.mail_provider == "google" ? local.mx_google :
    {}
  ) : {}
}

# --- Correo DESACTIVADO: null MX (RFC 7505) ---------------------------------
# Con Email Routing activo tampoco hay null MX: los MX reales los pone el
# producto y crear este registro lo rompería (conflicto de registros MX en
# el apex).
resource "cloudflare_dns_record" "null_mx" {
  count = (var.email_enabled || var.cloudflare_email_routing) ? 0 : 1

  zone_id  = var.zone_id
  name     = "@"
  type     = "MX"
  content  = "."
  priority = 0
  ttl      = 3600
  comment  = "Null MX (RFC 7505): el dominio no acepta correo. Gestionado por OpenTofu."
}

# --- Correo ACTIVADO: MX del proveedor --------------------------------------
resource "cloudflare_dns_record" "mx" {
  for_each = local.active_mx

  zone_id  = var.zone_id
  name     = "@"
  type     = "MX"
  content  = each.key
  priority = each.value
  ttl      = 3600
  comment  = "MX ${var.mail_provider}. Gestionado por OpenTofu."
}

# --- SPF --------------------------------------------------------------------
resource "cloudflare_dns_record" "spf" {
  zone_id = var.zone_id
  name    = "@"
  type    = "TXT"
  content = "\"${local.spf_record}\""
  ttl     = 3600
  comment = "SPF. Gestionado por OpenTofu."
}

# --- DMARC ------------------------------------------------------------------
# Nota operativa: p=reject desde el día 0 es correcto MIENTRAS el dominio no
# envíe correo legítimo. En cuanto se empiece a enviar (Resend, Hostinger,
# Google Workspace...), pasar primero a p=none con rua durante ~1-2 semanas
# para detectar flujos legítimos, y solo después volver a reject. Cambiar
# dmarc_policy para eso — ir directo a reject con envío activo tira correo
# real.
resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.zone_id
  name    = "_dmarc"
  type    = "TXT"
  content = "\"${local.dmarc_record}\""
  ttl     = 3600
  comment = "DMARC. Gestionado por OpenTofu."
}

# --- DKIM nulo (solo con correo desactivado) --------------------------------
# "p=" vacío significa "esta clave está revocada": invalida cualquier
# selector que alguien intente usar contra este dominio.
resource "cloudflare_dns_record" "dkim_null" {
  count = var.email_enabled ? 0 : 1

  zone_id = var.zone_id
  name    = "*._domainkey"
  type    = "TXT"
  content = "\"v=DKIM1; p=\""
  ttl     = 3600
  comment = "DKIM nulo: ninguna clave válida. Gestionado por OpenTofu."
}
