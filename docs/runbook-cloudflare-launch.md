# Runbook — Camino A: Cloudflare Workers + Neon + Doppler + Resend

Runbook operativo, humano, del Camino A de despliegue (ver `CLAUDE.md` → "Dos
caminos de despliegue"). Es la versión detallada, fase por fase, de lo que la
skill `disaster-deploy-cloudflare` automatiza. Úsalo tanto para el standup
inicial como para diagnosticar un despliegue que ya existe.

## Regla de oro: verifica el estado real, no lo que dice un doc

Antes de actuar sobre cualquier afirmación de este documento, de
`docs/architecture.md` o de cualquier otro runbook — **compruébala contra la
API o contra un resolver público, no la des por buena porque está escrita**.
Un doc de cutover puede describir una fase como "aplicada" y estar
describiendo una intención que nunca se ejecutó de verdad; solo la API de
Cloudflare y `dig` dicen la verdad.

```bash
dig +short NS <tu-dominio>              # ¿de verdad delegado a Cloudflare?
curl -sI https://<tu-dominio> | grep -i cf-ray   # ¿de verdad pasa por el borde?
```

Si no aparece `cf-ray`, el tráfico no está pasando por Cloudflare sin
importar lo que diga cualquier documento — verifica antes de construir sobre
esa suposición.

## Antes de empezar

- Dominio ya registrado y (idealmente) ya con nameservers apuntando a
  Cloudflare.
- Dos tokens de API de Cloudflare — ver `docs/cloudflare-tokens.md` para los
  permisos exactos de cada uno.
- Cuenta de Doppler y el CLI instalado — ver `docs/doppler.md`.
- Cuenta de Neon (Postgres serverless).
- `openTofu` instalado (`brew install opentofu` en macOS) si vas a aplicar
  `infra/cloudflare/`.
- `wrangler` instalado en cada paquete (`frontend/`, `backend/`, `admin/` —
  ya es devDependency).
- `config/deployment.config.json` ya rellenado (`disaster-configure` corrió).

## Fase 0 — antes de que exista servidor ni código

Esto se puede (y se debe) hacer el mismo día que registras el dominio, sin
esperar a tener nada más listo. Un dominio de emergencia sin SPF/DMARC es un
regalo para fraude de donaciones por correo, y no depende de que exista el
sitio.

- [ ] **Anti-suplantación de correo**: MX nulo (`.` prioridad 0), SPF
      `v=spf1 -all`, DMARC `p=reject`, DKIM nulo. Si el dominio va a mandar
      correo real después (vía Resend — Fase 10), empieza con `p=none` +
      `rua` un par de semanas para ver los flujos legítimos antes de pasar a
      `reject` — ir directo a `reject` con envío activo tira correo real.
- [ ] **CAA**: limita quién puede emitir certificados para tu dominio
      (`letsencrypt.org`, `pki.goog`, y los que uses). **No** agregues un
      `issuewild ";"` que bloquee comodines — Cloudflare necesita poder
      emitir su propio comodín para Universal SSL, y ese registro pelea
      contra su propia feature.
- [ ] **DNSSEC**: actívalo en el panel de Cloudflare (genera el DS) y
      publica el DS en el panel de tu registrador. Cloudflare lo reporta
      `pending` hasta que el registrador lo recoge — puede tardar horas.
- [ ] **Bucket R2** para fotos (Fase 6 lo detalla) y **widget Turnstile**
      (Fase 8) — se pueden crear ya, aunque no los conectes todavía.

El módulo de `infra/cloudflare/` (OpenTofu) codifica gran parte de esto —
ver la siguiente fase.

## Fase 1 — infra: aplicar y verificar

```bash
cd infra/cloudflare
doppler run --config prd -- tofu init
doppler run --config prd -- tofu plan
doppler run --config prd -- tofu apply
```

**Un `apply` exitoso no es prueba de que un setting de seguridad tomó
efecto.** Ha pasado que Terraform reporta éxito en HSTS mientras la API
seguía devolviendo `enabled: false` — un no-op silencioso. Después de cada
`apply` de un setting crítico, verifícalo contra la API real:

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/settings/security_header" \
  | jq '.result.value.strict_transport_security'
```

Gotchas conocidos del plan Free que el módulo ya corrige, pero vale la pena
recordar si adaptas el módulo:

- **Bot Fight Mode** no es un zone setting — es el recurso
  `cloudflare_bot_management` (con `enable_js` obligatorio). Y aunque lo
  actives, choca con la CSP del frontend — ver CLAUDE.md → "Conocimiento
  operativo".
- El **ruleset gestionado** del plan Free tiene un ID distinto al de
  planes Pro+ — usar el ID equivocado da `400 not entitled to execute this
  managed ruleset`.
- **Rate limiting** en Free exige la característica `cf.colo.id` además de
  `ip.src`, y el `period` solo admite 10 segundos.

## Fase 2 — capa de datos (Neon)

1. Crea el proyecto en Neon (dashboard, o `neon init --agent` para el
   onboarding guiado por CLI — genera un `.neon` local con solo
   `{orgId, projectId}`, sin secretos; es seguro commitear ese archivo en tu
   propio fork ya desplegado).
2. Guarda la connection string **pooled** (la del endpoint `-pooler`) en
   Doppler como `DATABASE_URL` — es la que usa el runtime. Las migraciones
   necesitan la conexión **directa** (sin `-pooler`), pero no hace falta una
   segunda variable: `scripts/migrate-direct.sh` la deriva automáticamente
   quitando el sufijo `-pooler` del host de `DATABASE_URL`.
3. Corre las migraciones con `scripts/migrate-direct.sh` — deriva el host
   directo (aborta si la URL de origen no tenía sufijo `-pooler` que quitar)
   y nunca imprime la URL completa, solo el host enmascarado:
   ```bash
   doppler run --config prd -- bash scripts/migrate-direct.sh DATABASE_URL
   ```
   Si no, corre `cd backend && npm run migrate` directo, verificando tú
   mismo que `DATABASE_URL` no lleva el sufijo `-pooler`.
4. Corre el seed inicial (crea el superadmin + siembra el catálogo de
   capacidades — ver AGENTS.md → "Minting una capacidad nueva").
5. **Cuidado con `neon connection-string`**: imprime el password crudo por
   stdout. Si lo corres en una sesión de agente, ese valor queda en el
   transcript — trátalo como una fuga y rota la rama (Neon no tiene
   reset-password directo; recrear la rama es el camino).

**Nunca bifurques la base de `stg` directamente desde `prd`** una vez que
`prd` tiene datos reales de personas — ver CLAUDE.md → "Conocimiento
operativo" para por qué. Puebla `stg` con datos sintéticos `DEMO-` en su
lugar.

## Fase 3 — secretos (Doppler)

Ver `docs/doppler.md` para el flujo completo. Resumen: `.env.example` es el
contrato de nombres; genera valores fuertes con `openssl rand` (mismo
comando que usaría `disaster-secrets-bootstrap` para el Camino B) y
guárdalos con `doppler secrets set` — nunca como argumento de shell.

## Fase 4 — deploys (Workers)

Cada paquete desplegable (`frontend/`, `backend/`, `admin/`) trae su propio
`wrangler.jsonc` con:

- `compatibility_flags: ["nodejs_compat"]`.
- Alias de esbuild para módulos que no corren tal cual en Workers (ver
  `backend/src/shims/`).
- **Sin `routes`** — nunca. Los dominios se adjuntan por la API de cuenta.
  Declarar `routes` hace que wrangler llame también a
  `/zones/{id}/workers/routes`, para lo que el token de cuenta no tiene
  permiso — ese fallo aborta el deploy **después** de subir el código y
  **antes** de promoverlo: el Worker sigue sirviendo la build anterior en
  silencio.
- Un bloque `env.staging` que declara TODO lo que staging necesita — a
  diferencia de `triggers`/cron, el bloque `queues` **no se hereda**
  automáticamente en `env.staging`.

Primer deploy de cada Worker:

```bash
cd backend   # o frontend/ o admin/
doppler run --config prd -- npx wrangler deploy
```

Después de CUALQUIER secreto nuevo en Doppler, empújalo al Worker (Doppler
no lo hace solo — ver `docs/doppler.md` § 5):

```bash
doppler secrets download --config prd --no-file --format env \
  | wrangler secret bulk --env production
```

## Fase 5 — staging

Staging existe para probar cambios de riesgo real antes de producción, y
solo prueba algo si se parece a producción: mismo `wrangler.jsonc` (bloque
`env.staging`), misma config de Doppler `stg`, mismos flags. Verifica que el
bloque `queues` de staging esté completo (no se hereda) antes de desplegar
ahí por primera vez.

Convención de nombres de dominio/Worker para staging (no requiere una clave
nueva en `config/deployment.config.json` — se deriva del valor ya existente
en `domains`):

| | Producción | Staging |
| --- | --- | --- |
| Web | `domains.web` (p.ej. `mapa.example.org`) | `staging.` + `domains.web` |
| API | `domains.api` (p.ej. `api.mapa.example.org`) | `api-staging.` + el resto del dominio |
| Admin | `domains.admin` | `admin-staging.` + el resto del dominio |
| Worker | `<prefijo>-web` / `-api` / `-admin` | mismo prefijo + `-staging` |

Elige `<prefijo>` una vez (p.ej. el nombre corto de tu organización o
evento) y reutilízalo en los tres `wrangler.jsonc` y en cada
`CHANGE_ME` correspondiente.

## Fase 6 — R2 (fotos)

1. Crea el bucket en el dashboard de Cloudflare (elige la ubicación más
   cercana a tu región operativa).
2. Crea un token de acceso (Object Read & Write, acotado al bucket) — esto
   **sí** requiere el dashboard, no hay forma de automatizarlo por CLI de
   forma segura.
3. Guarda las claves en Doppler con los NOMBRES EXACTOS que lee el código —
   `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, no el nombre que te dé el
   dashboard por defecto. Ver `.env.example` → sección R2.
4. Si le adjuntas un dominio propio al bucket (p.ej. `cdn.example.org`),
   espera a que el certificado TLS quede activo antes de apuntar
   `R2_PUBLIC_BASE`/`NEXT_PUBLIC_R2_PUBLIC_BASE` ahí.
5. Empuja las claves a los Workers (`wrangler secret bulk`, Fase 4) y
   redespliega el frontend — la CSP necesita reconstruirse para incluir el
   nuevo origen del CDN.
6. R2 puede estar completamente cableado en código y seguir "dormido" si
   nunca se provisionó — verifica con una foto real de prueba, no asumas por
   el código.

## Fase 7 — colas (Cloudflare Queues)

Declarar una cola en `wrangler.jsonc` **no la crea**. Antes del primer
deploy que la referencia:

```bash
wrangler queues create <nombre-cola>
wrangler queues create <nombre-cola>-dlq
# repite con --env staging si aplica, o con el nombre de staging si tu
# convención los distingue por nombre
```

Sin esto, el primer deploy que declara la cola falla con un error de API
poco claro (no un mensaje del tipo "la cola no existe"). Ver AGENTS.md →
"Jobs de fondo" para el resto del contrato (seam de dispatch, límite de
128 KB por mensaje, DLQ persistido en `audit_log`).

## Fase 8 — Turnstile: orden estricto

1. Crea el widget en el dashboard de Cloudflare Turnstile (cuenta gratis,
   unos minutos) — obtienes una site key (pública) y una secret key.
2. Pon `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en Doppler y **redespliega el
   frontend primero**. Esta variable se hornea en build time — no basta con
   que exista en Doppler, tiene que estar presente en el momento del build
   que se despliega.
3. Verifica que la site key llegó al bundle servido (busca el widget
   renderizado en un formulario real, o grepea el HTML servido por el
   string de la site key).
4. **Solo entonces** pon `TURNSTILE_SECRET_KEY` en el backend y
   redespliega. Si lo haces en el orden contrario, el backend rechaza con
   403 el 100% de las escrituras públicas, sin ningún error visible en
   logs — el único síntoma es que la gente no puede enviar reportes.

Un script como `scripts/verify-turnstile.sh <staging|production>` (si tu
fork lo trae) automatiza justamente este chequeo en el orden que importa —
úsalo antes de dar el paso 4 por confirmado. Cuidado: un `403` en el paso 3
también puede venir del WAF/managed-challenge de borde de Cloudflare, no
solo de Turnstile — no asumas que "recibí un 403" prueba que Turnstile ya
está activo.

## Fase 9 — Access delante del panel admin (opcional)

Ver `docs/runbook-admin.md` para el patrón completo de dos capas de
identidad (Access decide quién llega al login; el RBAC de la app decide qué
puede hacer una vez adentro). Resumen operativo: crea una app de Access
scoped exactamente a tu dominio de admin, con un bypass explícito para la
ruta de health check que usa tu deploy workflow, o el smoke check post-deploy
se rompe viendo un redirect de login en vez de un 200.

## Fase 10 — SMTP (Resend)

1. Agrega tu dominio en el dashboard de Resend, copia los registros DNS que
   te da (DKIM, MX de envío, SPF) y agrégalos a tu zona.
2. Crea una API key de solo envío.
3. Pon `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_FROM`
   en Doppler, en ambos configs (`stg`/`prd`), y empújalos a los Workers de
   backend correspondientes.
4. Sin SMTP configurado, los links de invitación se devuelven en la
   respuesta de la API (modo dev) y el OTP de reset de contraseña solo llega
   a los logs del servidor — funcional para probar, no para operar de
   verdad.

## Verificación y diagnóstico

Recetas que resuelven la mayoría de los "¿esto está roto o solo parece
roto?" de un despliegue Cloudflare.

### ¿El deploy de verdad se aplicó?

La cache de zona puede servir la build anterior justo después de un deploy
exitoso — indistinguible de un deploy fallido con un solo `curl`.

```bash
# Compara el hash del bundle servido contra lo que acabas de construir:
curl -s https://<tu-dominio> | grep -oE 'turbopack-[a-f0-9]+\.js' | head -1

# O salta la cache de zona yendo directo al origen de Workers:
curl -s https://<worker-name>.<tu-subdominio>.workers.dev | grep -oE 'turbopack-[a-f0-9]+\.js'
```

Si el hash del `workers.dev` ya cambió pero el del dominio propio no, es
cache de borde, no un deploy fallido — espera la propagación o purga cache
explícitamente antes de investigar más.

### `healthz` vs `readyz` — separar el frío del Worker del frío de Neon

Un endpoint sin I/O (`/api/healthz`) y uno con una consulta real
(`/api/readyz`, típicamente un `SELECT 1`) prueban cosas distintas. Si solo
el segundo es lento tras un rato de inactividad, es el cold-start de
scale-to-zero de Neon, no el isolate de Cloudflare — en la práctica, casi
siempre es Neon.

```bash
for i in 1 2 3; do
  curl -w "healthz: %{time_total}s\n" -o /dev/null -s https://api.<tu-dominio>/api/healthz
  curl -w "readyz:  %{time_total}s\n" -o /dev/null -s https://api.<tu-dominio>/api/readyz
  sleep 180
done
```

### Leer los logs del propio Worker antes de teorizar

Un vago "a veces tira 503" se resuelve mucho más rápido leyendo los logs del
Worker que adivinando. Dos vías:

```bash
# Streaming en vivo — la más simple, sin gotchas de API:
doppler run --config prd -- npx wrangler tail --format pretty

# Consulta histórica vía la API de Observability — cada filtro necesita un
# campo "type" explícito (p.ej. "type": "string") junto al operador; un
# filtro sin ese campo puede devolver cero resultados sin ningún error,
# no un fallo obvio.
curl -s -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/observability/telemetry/query" \
  -H "Content-Type: application/json" \
  -d '{"filters":[{"key":"$metadata.error","operator":"eq","type":"string","value":"true"}]}'
```

### Colo-propagación: da margen antes de sacar conclusiones

Justo después de un deploy, distintos centros de datos de Cloudflare
(*colos*) sirven la versión nueva en momentos ligeramente distintos. Un
puñado de requests fallidos en los primeros segundos después de un deploy
puede ser eso, no una regresión real. Da un margen de segundos y repite el
chequeo mostrando la tendencia, no un solo request — y evita machacar con
requests demasiado rápido, puede pegarle al rate-limit de la propia zona.

### Respuestas de API cacheadas — no solo bundles estáticos

No solo el frontend estático puede quedar cacheado en el borde: una
respuesta de API también, si el endpoint no marca explícitamente
`no-store`/`no-cache`. Antes de confiar en una discrepancia de datos como
real, repite la petición con un parámetro que rompa cache
(`?_=<timestamp>`) o una cabecera `Cache-Control: no-cache`.
