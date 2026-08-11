# Cloudflare como código

Módulo OpenTofu que gestiona una zona de Cloudflare completa: registros DNS
del sitio, seguridad de correo (anti-suplantación), CAA, ajustes TLS/HSTS,
WAF gestionado, rate limits y cache rules.

Los registros DNS y los de correo viven **en este módulo**, no solo en el
panel de Cloudflare. Un despliegue anterior que sirvió de base para este
módulo los creó a mano en el dashboard, y su documentación acabó
describiendo una arquitectura de DNS que nunca se llegó a aplicar de
verdad — nadie lo notó hasta comparar `dig`/`curl` contra los docs, meses
después. Gestionar los registros aquí hace que esa deriva salga en
`tofu plan` en vez de descubrirse por accidente.

Este módulo aplica **encima de** la arquitectura por defecto de esta
plantilla (VPS único + Caddy, `docker-compose.prod.yml`): `dns.tf` crea los
A/CNAME del sitio apuntando a `origin_ip`. Si tu fork migra a otra
arquitectura de origen (p.ej. Cloudflare Workers con custom domain), revisa
en particular el aviso de `cache.tf` — las Cache Rules de zona son un no-op
para un Worker en custom domain.

## Uso

Prerrequisito: [OpenTofu](https://opentofu.org/) instalado.

```bash
brew install opentofu   # o el gestor de paquetes de tu SO
```

```bash
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars   # y rellenar con los valores reales de tu zona
tofu init
./tf plan     # ./tf mapea el token de tu gestor de secretos a CLOUDFLARE_API_TOKEN — ver más abajo
./tf apply
```

Después de cada `apply`, verifica que lo que dice `tofu` coincide con lo que
la API de Cloudflare sirve de verdad:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... ./verify-settings.sh
```

`tofu apply` saliendo con éxito **no es prueba** de que un ajuste tomó
efecto — HSTS lo demostró en un despliegue real: el provider reportaba éxito
mientras la API seguía sirviendo `enabled: false`. `verify-settings.sh`
existe exactamente para no tener que fiarte del exit code.

## Dos tokens

Cloudflare no tiene un solo token que cubra todo lo que hace falta para un
despliegue completo con permisos mínimos. Este módulo (y la operación normal
de un despliegue en Workers/Pages/R2 detrás de esta zona) necesita **dos**
tokens con alcances distintos y complementarios — ninguno basta por sí solo:

### Token de ZONA (el que usa este módulo)

Acotado a tu zona concreta, no a "todas las zonas" de la cuenta (si tu
cuenta de Cloudflare gestiona otros dominios, un token "All zones" pone
todos al alcance de un solo error de este módulo).

| Permiso | Nivel | Para qué |
|---|---|---|
| `Zone: DNS: Edit` | Zone | registros A/CNAME/TXT/MX/CAA (`dns.tf`, `email-security.tf`, `resend.tf`) |
| `Zone: Zone Settings: Edit` | Zone | SSL, HSTS, TLS, Bot Fight Mode (`settings.tf`) |
| `Zone: Zone: Edit` | Zone | DNSSEC (`dnssec.tf`) |
| `Zone: WAF: Edit` | Zone | rulesets gestionados (`waf.tf`) |
| `Zone: Cache Rules: Edit` | Zone | cache rules (`cache.tf`) |
| `Zone: Rate Limiting: Edit` | Zone | rate limits (`ratelimit.tf`) |

### Token de CUENTA (para lo que este módulo NO gestiona — ver "Fuera de alcance")

No lo usa `tofu apply` en este directorio, pero cualquier despliegue real
detrás de esta zona lo necesita para operar el resto de Cloudflare, así que
se documenta aquí junto al de zona para no descubrirlo a trozos, en mitad de
un lanzamiento, cada vez que un token 403 en algo nuevo:

| Permiso | Nivel | Para qué |
|---|---|---|
| `Account: Workers R2 Storage: Edit` | Account | bucket R2 (fotos/estáticos) |
| `Account: Workers Scripts: Edit` | Account | despliegue de Workers/Pages, si tu fork usa esa arquitectura |
| `Account: Cloudflare Pages: Edit` | Account | despliegue de Pages, si aplica |
| `Account: Turnstile: Edit` | Account | crear/rotar el widget de Turnstile (prueba de humanidad en escrituras públicas) |
| `Account: Queues: Edit` | Account | Cloudflare Queues, si tu fork las usa como reemplazo de un worker de colas |
| `Account: Access: Organizations, Identity Providers, and Groups: Edit` | Account | proteger el panel admin con Cloudflare Access (login OTP/SSO delante de `admin.<tu-dominio>`) |
| `Account: Access: Apps and Policies: Edit` | Account | crear/editar la app y política de Access del panel admin |
| `Account: Access: Audit Logs: Read` | Account | diagnosticar intentos de login fallidos contra Access (sin esto, un login OTP fallido de un teammate es indiagnosticable) |

El provider de Cloudflare solo lee `CLOUDFLARE_API_TOKEN` — nunca dos
variables a la vez. El wrapper [`./tf`](./tf) mapea el nombre que le des al
token de zona en tu gestor de secretos a esa variable antes de invocar
`tofu`, así no hay que recordar el mapeo cada vez. Ver los comentarios de
ese script para el patrón exacto (es agnóstico del gestor de secretos que
uses — Doppler, 1Password, lo que sea).

## Orden de aplicación

`ssl_mode` (en `terraform.tfvars`, resuelto por `settings.tf`) por defecto
es **`full`**, no `strict`, a propósito. Si pasas a `strict` **antes** de
que el origen (tu VPS con Caddy) tenga un certificado TLS válido, el sitio
devuelve **526** para todo el mundo hasta que lo reviertas.

Orden correcto:

1. `origin_ip` vacío → aplica settings/WAF/cache/correo/CAA. Nada del sitio
   resuelve todavía; eso es correcto, esos registros no dependen del
   servidor.
2. VPS provisionado → rellena `origin_ip`, `tofu apply` crea los A/CNAME
   proxied. Deja `ssl_mode = "full"`.
3. Origen con certificado real (Cloudflare Origin CA — ver el snippet
   `cf_origin_tls` comentado en `Caddyfile.example` — o Let's Encrypt) →
   **solo entonces** sube `ssl_mode` a `"strict"` y vuelve a aplicar.

Si tu fork tiene un runbook operativo más detallado con los pasos exactos de
DNS/servidor, míralo en `docs/runbook-cloudflare-launch.md`.

## Política de deriva (drift)

Este módulo modela la realidad **en vivo** de la zona, no un ideal de cómo
"debería" estar configurada. Antes de cualquier `tofu apply`:

1. Corre `tofu plan` y lee el diff completo, no solo el resumen.
2. Si el plan propone revertir un ajuste que un humano cambió a mano en el
   panel a propósito (Bot Fight Mode apagado por una colisión de CSP
   conocida, un registro de Email Routing que el producto gestiona, un DNS
   record que alguien creó para depurar algo puntual), **para y pregunta**
   antes de aplicar. `tofu apply` no distingue "esto es deriva accidental
   que hay que corregir" de "esto es una decisión operativa deliberada que
   el código de este módulo aún no conoce".
3. Reconcilia el código (nueva variable, nuevo valor por defecto, `tofu
   import` del registro que faltaba) para que el estado deliberado quede
   representado — no lo dejes como deriva permanente ignorada, porque el
   próximo `apply` sin revisar la va a revertir igual.

Nunca reviertas silenciosamente un estado manual deliberado solo porque
`tofu plan` lo señala como diferencia.

## DNSSEC: el DS va al registrador

`dnssec.tf` activa DNSSEC en la zona y expone el registro DS resultante como
output (`dnssec_ds`). Si Cloudflare es también el **registrador** de tu
dominio, ese DS se publica solo en el TLD padre. Si el registrador es
**otro** (Namecheap, GoDaddy, el NIC de tu país...), tienes que copiarlo tú
a mano al panel de ese registrador — Cloudflare no puede hacerlo por ti.

```bash
tofu output dnssec_ds
```

Formato de ejemplo (esto es un DS **de ejemplo, inventado** — el tuyo lo da
el output de arriba, no lo copies de aquí):

```
Key Tag: 12345
Algorithm: 13 (ECDSAP256SHA256)
Digest Type: 2 (SHA-256)
Digest: A1B2C3D4E5F60718293A4B5C6D7E8F9012345678901234567890ABCDEF12345
```

Mientras el DS no esté publicado en el registrador, DNSSEC queda en estado
`pending` en Cloudflare y `unsigned` en el padre — verifícalo con
`dig DS <tu-dominio> @one.one.one.one` (`verify-settings.sh` también lo comprueba).

## Estado

`terraform.tfstate` es local por defecto. En cuanto haya más de una persona
aplicando contra esta zona, muévelo a un backend remoto (Cloudflare R2 vía
el backend S3-compatible de OpenTofu, u otro object storage) para evitar
dos `apply` concurrentes pisándose el estado.

## Fuera de alcance

Gestionado en otro sitio (dashboard de Cloudflare, otro módulo, o a mano),
no por este directorio:

- **Widget Turnstile**: se crea en el panel (o con `cloudflare_turnstile_widget`
  si quieres traerlo a este módulo); sus claves van a los secrets de tu
  backend/CI, no a `terraform.tfvars`.
- **Bucket R2** y sus claves de acceso.
- **Origin CA cert**: `cloudflare_origin_ca_certificate`, una vez conozcas
  los hostnames definitivos del origen — ver el snippet `cf_origin_tls` en
  `Caddyfile.example`.
- **Cloudflare Access** delante del panel admin (app + política de
  autenticación OTP/SSO): se gestiona hoy fuera de este módulo con el token
  de cuenta de la tabla de arriba. Añadir `cloudflare_zero_trust_access_*`
  aquí es una extensión natural si tu fork lo necesita reproducible.
- **Workers/Pages/Queues**: su despliegue vive en tu pipeline de CI
  (`wrangler`), no en este módulo — el token de cuenta de arriba es el que
  necesitan.
