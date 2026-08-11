terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.0.0"
    }
  }
}

# Si cloudflare_api_token va vacío, el provider lee CLOUDFLARE_API_TOKEN del
# entorno. Eso es lo que permite `./tf apply` (o `doppler run -- tofu apply`)
# sin que el token toque el disco ni el historial del shell.
provider "cloudflare" {
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}
