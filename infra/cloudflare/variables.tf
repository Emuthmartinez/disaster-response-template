# Variables del módulo.
#
# Los identificadores de ESTA zona (zone_id, zone_name, account_id, los
# *_hostname) NO tienen default a propósito: son la identidad de un
# despliegue concreto, no algo que una plantilla deba adivinar o inventar.
# Rellénalos en `terraform.tfvars` (copia `terraform.tfvars.example`) — nunca
# en este archivo, y nunca con valores reales en un commit de la plantilla.
#
# Todo lo demás (posturas de seguridad, plan, fricción anti-bot) sí tiene
# default: son decisiones de producto razonables para cualquier despliegue de
# este template, no identidad de una zona concreta.

# Preferir NO pasar esto. Dejarlo vacío y ejecutar bajo tu gestor de secretos
# (Doppler, 1Password, etc. — ver `./tf` y docs/runbook-cloudflare-launch.md),
# que inyecta CLOUDFLARE_API_TOKEN en el entorno; el provider lo recoge solo.
# Así el token no acaba en terraform.tfvars, ni en el historial del shell, ni
# en el state.
variable "cloudflare_api_token" {
  description = "Token API de Cloudflare. Vacío = leer CLOUDFLARE_API_TOKEN del entorno (recomendado)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "zone_id" {
  description = "Zone ID de tu dominio en Cloudflare (Dashboard → Overview → panel derecho, o `cloudflare zones list` con la CLI). Sin default: es identidad de despliegue."
  type        = string
}

variable "zone_name" {
  description = "Dominio apex de la zona (ej. mapa.example.org). Se usa como target de los CNAME de www/api/admin y en las reglas host-based de WAF/rate-limit/cache."
  type        = string
}

variable "account_id" {
  description = <<-EOT
    Account ID de Cloudflare (Dashboard → cualquier zona → panel derecho, o
    `cloudflare accounts list`). Ningún recurso de ESTE módulo lo consume
    directamente hoy — todos los recursos de aquí son de ZONA, no de cuenta
    (ver README, sección "Dos tokens"). Se declara igualmente para que
    terraform.tfvars sea la única fuente de identidad de Cloudflare del
    despliegue, y para futuros recursos de cuenta (Cloudflare Access, R2,
    Turnstile, Workers/Pages, Queues) que añadas a este mismo módulo más
    adelante sin tener que introducir un segundo archivo de identidad.
  EOT
  type        = string
}

variable "api_hostname" {
  description = "Hostname público del backend (ej. api.<zone_name>). Debe ser subdominio DIRECTO de zone_name: dns.tf deriva el nombre del registro restando zone_name del final, y falla el apply con un mensaje explícito si no cumple esa regla."
  type        = string
}

variable "admin_hostname" {
  description = "Hostname del panel admin (ej. admin.<zone_name>). Misma regla que api_hostname: subdominio directo de zone_name."
  type        = string
}

variable "r2_public_hostname" {
  description = "Hostname público de tu bucket de objetos (Cloudflare R2 u otro compatible S3) para fotos/estáticos, ej. cdn.<zone_name>. Se usa en las cache rules (cache.tf). El bucket en sí, sus claves y el binding al Worker/backend quedan fuera de este módulo — ver README, 'Fuera de alcance'."
  type        = string
}

# --- Origen -----------------------------------------------------------------
# En un fork recién clonado el VPS todavía no existe. Mientras origin_ip esté
# vacío, este módulo NO crea los registros A/CNAME del sitio: solo aplica
# settings, WAF, rate limits, cache y los registros de seguridad de correo
# (que no dependen del origen y deberían aplicarse desde el día 0, antes de
# que exista ni el servidor ni el código — ver email-security.tf). Rellenar
# origin_ip y volver a aplicar cuando exista el servidor.
variable "origin_ip" {
  description = "IP pública del VPS de origen (frontend). Vacío = no crear registros del sitio."
  type        = string
  default     = ""

  validation {
    condition     = var.origin_ip == "" || can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}$", var.origin_ip))
    error_message = "origin_ip debe ser una IPv4 válida o cadena vacía."
  }
}

variable "origin_ipv6" {
  description = "IPv6 pública del VPS de origen. Vacío = no crear registro AAAA."
  type        = string
  default     = ""
}

# --- Correo -------------------------------------------------------------------
# Por defecto el dominio queda BLOQUEADO para envío/recepción de correo (null
# MX + SPF -all + DMARC reject + DKIM nulo). Es la postura correcta mientras
# no se configure un proveedor: impide la suplantación en campañas de
# phishing de donaciones, que es el vector de abuso más probable en un
# dominio de emergencia/catástrofe — y se puede aplicar el día 0, antes de
# que exista ni el servidor ni el código.
variable "email_enabled" {
  description = "false = dominio bloqueado para correo (recomendado hasta elegir proveedor). true = usar mail_provider."
  type        = bool
  default     = false
}

variable "mail_provider" {
  description = "Proveedor de correo (mailboxes completos, no el SMTP transaccional de la app) cuando email_enabled = true. Valores: hostinger | google | none."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["hostinger", "google", "none"], var.mail_provider)
    error_message = "mail_provider debe ser hostinger, google o none."
  }
}

variable "dmarc_rua" {
  description = "Buzón para informes agregados DMARC (rua). Vacío = sin informes."
  type        = string
  default     = ""
}

variable "dmarc_policy" {
  description = "Política DMARC: none (solo observar) | quarantine | reject."
  type        = string
  default     = "reject"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy debe ser none, quarantine o reject."
  }
}
