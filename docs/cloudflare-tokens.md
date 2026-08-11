# Tokens de Cloudflare (Camino A)

El Camino A (Cloudflare Workers + Neon + Doppler) necesita **dos** tokens de
API de Cloudflare con permisos complementarios. Ninguno de los dos basta por
sí solo — esto no está documentado en el dashboard de Cloudflare y cuesta un
ciclo entero de descubrimiento por ensayo y error si no lo sabes de
antemano: el primer token que crees va a devolver `403` en la mitad de lo
que necesitas.

## Por qué hacen falta dos

Cloudflare separa sus permisos en dos ámbitos (*scopes*) que no se pueden
combinar en un único token con alcance "zona específica": permisos de
**Zone** (atados a un dominio concreto) y permisos de **Account** (atados a
la cuenta completa, sin noción de "solo este dominio"). El módulo OpenTofu de
`infra/cloudflare/` necesita permisos de Zone; los Workers, R2 y Turnstile
necesitan permisos de Account.

## Token 1 — alcance de zona (`CLOUDFLARE_ZONE_API_TOKEN`)

Para: DNS, settings de zona, rulesets (WAF/cache/rate limit), DNSSEC. Es el
que usa `infra/cloudflare/` (OpenTofu).

<https://dash.cloudflare.com/profile/api-tokens> → **Create Token** →
**Create Custom Token**.

| Tipo | Recurso | Nivel |
| --- | --- | --- |
| Zone | Zone Settings | Edit |
| Zone | Zone | Edit |
| Zone | DNS | Edit |
| Zone | Cache Rules | Edit |
| Zone | Rate Limiting | Edit |
| Zone | WAF | Edit |

**Zone Resources:** `Include` → `Specific zone` → tu dominio. **No** uses "All
zones" — si tu cuenta tiene otros dominios, un token de zona específica
mantiene el radio de un error acotado a este proyecto.

## Token 2 — alcance de cuenta (`CLOUDFLARE_ACCOUNT_API_TOKEN`)

Para: Workers (deploy + dominios personalizados), R2, Turnstile. Si además
vas a poner Cloudflare Access (Zero Trust) delante del panel admin (ver
`docs/runbook-admin.md`), este mismo token necesita también permisos de
Access.

| Tipo | Recurso | Nivel |
| --- | --- | --- |
| Account | Workers Scripts | Edit |
| Account | Workers R2 Storage | Edit |
| Account | Turnstile | Edit |
| Account | Access: Apps and Policies | Edit *(solo si usas Cloudflare Access)* |
| Account | Access: Audit Logs | Read *(solo si necesitas depurar logins fallidos de Access)* |

**Account Resources:** `Include` → tu cuenta.

> El permiso de Audit Logs se suele agregar tarde, cuando ya hace falta
> depurar por qué a alguien no le funciona el login de Access — mejor
> incluirlo desde el principio si vas a usar Access, para no tener que volver
> al dashboard después.

## Caducidad y regeneración

Pon un **TTL corto** en ambos tokens (7 días es razonable para el standup
inicial). Son tokens de despliegue, no credenciales permanentes — se pueden
regenerar sin downtime en cuanto expiran, siempre que el nuevo valor se
suba a Doppler antes de que el viejo caduque. Trátalos como cualquier
secreto de corta vida: si expira uno usado por CI, el siguiente deploy falla
con un error de autenticación claro, no algo silencioso.

## Guardar — sin pegarlos en el chat

Un token pegado en una conversación con un agente queda en el historial de
esa conversación. Dos formas seguras de guardarlo:

```bash
# A disco, con permisos restringidos:
pbpaste > ~/.cloudflare-token && chmod 600 ~/.cloudflare-token

# O directo a Doppler, en modo interactivo (no deja el valor en el
# historial del shell):
doppler secrets set CLOUDFLARE_ZONE_API_TOKEN
```

Ver `docs/doppler.md` para el flujo completo de Doppler.

## Comprobar que un token funciona

```bash
CF=$(cat ~/.cloudflare-token)
curl -s -H "Authorization: Bearer $CF" \
  "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  | head -c 200
```

Debe devolver `"success": true` (con `"result": []` si la zona está vacía
todavía). `Authentication error` significa que al token le faltan permisos —
revisa la tabla del token correspondiente arriba.
