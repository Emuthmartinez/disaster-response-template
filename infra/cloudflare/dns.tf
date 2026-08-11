# Registros DNS del sitio, como código.
#
# LECCIÓN DE LANZAMIENTO: en un despliegue anterior que sirvió de base para
# este módulo, los registros DNS se crearon a mano en el panel de Cloudflare
# y la documentación acabó describiendo una arquitectura que nunca se llegó a
# aplicar (docs decían "Cloudflare + origen X"; la realidad, verificada con
# `dig`/`curl`, era otro proveedor de DNS sin proxy de Cloudflare de por
# medio). Gestionar los registros aquí hace que esa deriva salga en
# `tofu plan` en vez de descubrirse meses después comparando docs contra la
# realidad.
#
# Todos los registros del sitio dependen de var.origin_ip. Mientras esté
# vacío no se crea ninguno: el resto del módulo (settings, WAF, correo) sí se
# aplica igual — ver variables.tf.

locals {
  has_origin = var.origin_ip != ""

  # api_hostname/admin_hostname son subdominios directos de zone_name (ej.
  # "api.mapa.example.org" bajo la zona "mapa.example.org"). Restamos el
  # sufijo para obtener el nombre corto que espera `cloudflare_dns_record`.
  # Si alguien pasa un hostname que NO es subdominio directo de la zona, el
  # `trimsuffix` no encuentra el sufijo y devuelve la cadena intacta —
  # crearía un registro con un nombre absurdo en vez de fallar. Por eso cada
  # recurso de abajo lleva un `precondition` explícito que corta el apply con
  # un mensaje claro en vez de dejar pasar ese caso silenciosamente.
  api_subdomain   = trimsuffix(var.api_hostname, ".${var.zone_name}")
  admin_subdomain = trimsuffix(var.admin_hostname, ".${var.zone_name}")
}

# Apex -> VPS. Proxied: el tráfico pasa por el borde de Cloudflare (DDoS,
# WAF, cache) antes de tocar el origen.
resource "cloudflare_dns_record" "apex" {
  count = local.has_origin ? 1 : 0

  zone_id = var.zone_id
  name    = "@"
  type    = "A"
  content = var.origin_ip
  proxied = true
  ttl     = 1 # 1 = automático; obligatorio cuando proxied = true
  comment = "Apex -> VPS origen. Gestionado por OpenTofu."
}

resource "cloudflare_dns_record" "apex_v6" {
  count = local.has_origin && var.origin_ipv6 != "" ? 1 : 0

  zone_id = var.zone_id
  name    = "@"
  type    = "AAAA"
  content = var.origin_ipv6
  proxied = true
  ttl     = 1
  comment = "Apex IPv6 -> VPS origen. Gestionado por OpenTofu."
}

# www / api / admin apuntan al apex por CNAME (Cloudflare los aplana). Así un
# cambio de IP de origen es UNA sola edición, no cuatro.
resource "cloudflare_dns_record" "www" {
  count = local.has_origin ? 1 : 0

  zone_id = var.zone_id
  name    = "www"
  type    = "CNAME"
  content = var.zone_name
  proxied = true
  ttl     = 1
  comment = "www -> apex. Gestionado por OpenTofu."
}

resource "cloudflare_dns_record" "api" {
  count = local.has_origin ? 1 : 0

  zone_id = var.zone_id
  name    = local.api_subdomain
  type    = "CNAME"
  content = var.zone_name
  proxied = true
  ttl     = 1
  comment = "api -> apex (el origen enruta por cabecera Host). Gestionado por OpenTofu."

  lifecycle {
    precondition {
      condition     = endswith(var.api_hostname, ".${var.zone_name}")
      error_message = "api_hostname (\"${var.api_hostname}\") debe ser un subdominio directo de zone_name (\"${var.zone_name}\"), ej. \"api.${var.zone_name}\". Ajusta api_hostname en terraform.tfvars."
    }
  }
}

resource "cloudflare_dns_record" "admin" {
  count = local.has_origin ? 1 : 0

  zone_id = var.zone_id
  name    = local.admin_subdomain
  type    = "CNAME"
  content = var.zone_name
  proxied = true
  ttl     = 1
  comment = "admin -> apex (el origen enruta por cabecera Host). Gestionado por OpenTofu."

  lifecycle {
    precondition {
      condition     = endswith(var.admin_hostname, ".${var.zone_name}")
      error_message = "admin_hostname (\"${var.admin_hostname}\") debe ser un subdominio directo de zone_name (\"${var.zone_name}\"), ej. \"admin.${var.zone_name}\". Ajusta admin_hostname en terraform.tfvars."
    }
  }
}

# --- CAA --------------------------------------------------------------------
# Restringe qué CAs pueden emitir certificados para el dominio. La lista
# incluye las CAs que Cloudflare puede usar para el certificado de borde;
# recortarla ROMPE la emisión/renovación. Let's Encrypt va incluida para el
# cert del origen si se usa HTTP-01 en Caddy en vez de un Origin CA cert.
locals {
  caa_issuers = [
    "letsencrypt.org", # Universal SSL + Caddy en el origen
    "pki.goog",        # Google Trust Services (Universal SSL)
    "digicert.com",    # certificados avanzados
    "sectigo.com",
    "comodoca.com",
    "ssl.com",
  ]
}

resource "cloudflare_dns_record" "caa_issue" {
  for_each = toset(local.caa_issuers)

  zone_id = var.zone_id
  name    = "@"
  type    = "CAA"
  ttl     = 3600
  data = {
    flags = 0
    tag   = "issue"
    value = each.value
  }
  comment = "CAA issue. Gestionado por OpenTofu."
}

# NO poner `issuewild ";"` (prohibir wildcards).
#
# LECCIÓN DE LANZAMIENTO: se probó en producción y es contraproducente.
# Cloudflare emite un certificado wildcard (*.<zone_name>) para su propio
# Universal SSL, así que al detectar un registro `issuewild ";"` SINTETIZA en
# las respuestas DNS sus propios `issuewild` para cada una de sus CAs — se ve
# con `dig CAA <tu-dominio>` aunque en la zona no exista ese registro.
#
# Resultado: el `;` no impide ningún wildcard (los issuewild sintetizados lo
# permiten igual) y solo confunde a quien audite el dominio. Los `issue` de
# arriba ya limitan qué CAs pueden emitir, que es la protección real.
