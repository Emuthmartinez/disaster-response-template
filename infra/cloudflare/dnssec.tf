# DNSSEC.
#
# Firma criptográficamente las respuestas DNS de la zona: impide que un
# resolver envenenado devuelva una IP falsa para tu dominio. En un dominio de
# emergencia/catástrofe eso importa más de lo normal — redirigir el tráfico a
# una copia falsa del sitio es una vía directa al fraude de donaciones.
#
# Si Cloudflare es también el REGISTRADOR de tu dominio, el registro DS se
# publica solo en el padre (el TLD: .org, .co, lo que sea) al activar esto.
# Si el registrador es OTRO (Namecheap, GoDaddy, el NIC local de tu país...),
# Cloudflare NO puede publicarlo por ti: tienes que copiar el DS que sale en
# el output `dnssec_ds` de abajo al panel de tu registrador A MANO. Mientras
# no lo hagas, DNSSEC queda en estado "pending" en Cloudflare y "unsigned" en
# el padre — verifícalo con `dig DS <tu-dominio> @one.one.one.one` después de aplicar
# (verify-settings.sh también lo comprueba). Ver el README de este módulo,
# sección "DNSSEC", para un ejemplo del formato del registro DS a pegar.

resource "cloudflare_zone_dnssec" "this" {
  zone_id = var.zone_id
  status  = "active"
}

output "dnssec_ds" {
  description = "Registro DS. Con Cloudflare como registrador se publica solo; con otro registrador, cópialo en su panel."
  value       = try(cloudflare_zone_dnssec.this.ds, null)
}
