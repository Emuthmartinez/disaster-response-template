# Registros DNS de un proveedor SMTP transaccional (invitaciones + reset de
# contraseña por OTP del panel admin — ver las variables SMTP_* en
# `backend/.env.example`). Esto es DISTINTO de mail_provider/email-security.tf:
# aquel gobierna mailboxes completos (admin@, contacto@); esto es solo el
# subdominio de envío saliente de un proveedor transaccional.
#
# OPCIONAL Y APAGADO POR DEFECTO (smtp_provider = "none"). El ejemplo
# concreto de abajo es Resend; si usas otro proveedor (Postmark, SES,
# SendGrid...) adapta este archivo — casi todos piden el mismo patrón de
# tres registros: un TXT DKIM, un MX de retorno de bounces y un TXT SPF, casi
# siempre en un subdominio de envío dedicado (no el apex).
#
# LECCIÓN DE LANZAMIENTO: cuando el proveedor "auto-crea" estos registros
# desde su propia integración proveedor↔Cloudflare (común en Resend y
# similares — un clic en su dashboard y aparecen solos en tu zona), NO los
# copies a mano a otro sitio ni los dejes vivir solo en el panel. Impórtalos
# a este módulo con `tofu import` (ver comando de ejemplo en el README, o
# `tofu import cloudflare_dns_record.resend_dkim[0] <zone_id>/<record_id>`)
# para que cualquier deriva futura — el proveedor rota la clave DKIM, alguien
# borra el MX a mano — aparezca en `tofu plan` igual que el resto de la
# zona. Un valor de clave copiado a mano y pegado aquí queda desincronizado
# la primera vez que el proveedor la rote.

variable "smtp_provider" {
  description = "Proveedor SMTP transaccional: none | resend. 'none' no crea ningún registro de este archivo."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "resend"], var.smtp_provider)
    error_message = "smtp_provider debe ser none o resend."
  }
}

variable "resend_dkim_public_key" {
  description = "Valor 'p=' del registro DKIM que Resend muestra al verificar tu dominio (Dashboard → Domains → tu dominio → registro TXT resend._domainkey). NO es secreto — es una clave pública, pensada para publicarse en DNS — pero SÍ identifica tu cuenta de Resend concreta: no reutilices el valor de otro despliegue ni lo dejes como placeholder en producción. Requerido solo si smtp_provider = \"resend\"."
  type        = string
  default     = ""
}

locals {
  resend_enabled = var.smtp_provider == "resend"
}

resource "cloudflare_dns_record" "resend_dkim" {
  count = local.resend_enabled ? 1 : 0

  zone_id = var.zone_id
  name    = "resend._domainkey"
  type    = "TXT"
  content = "\"p=${var.resend_dkim_public_key}\""
  ttl     = 3600
  proxied = false
  comment = "DKIM Resend. Gestionado por OpenTofu (ideal: importado desde el registro que Resend auto-creó, no copiado a mano — ver nota arriba)."
}

resource "cloudflare_dns_record" "resend_send_mx" {
  count = local.resend_enabled ? 1 : 0

  zone_id  = var.zone_id
  name     = "send"
  type     = "MX"
  content  = "feedback-smtp.us-east-1.amazonses.com"
  priority = 10
  ttl      = 3600
  proxied  = false
  comment  = "MX de retorno de bounces (Resend sobre SES). Verifica el valor exacto en tu panel de Resend: puede variar por región/cuenta."
}

resource "cloudflare_dns_record" "resend_send_spf" {
  count = local.resend_enabled ? 1 : 0

  zone_id = var.zone_id
  name    = "send"
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  ttl     = 3600
  proxied = false
  comment = "SPF del subdominio de envío de Resend. Gestionado por OpenTofu."
}
