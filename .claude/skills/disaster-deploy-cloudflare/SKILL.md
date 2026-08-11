---
name: disaster-deploy-cloudflare
description: Levanta la plantilla en Cloudflare Workers (frontend + API + admin, los tres vía httpServerHandler/@opennextjs/cloudflare) contra Neon Postgres, con Doppler como gestor de secretos y Resend como SMTP opcional. Camino PRIMARIO de despliegue de este template (el VPS/docker-compose de disaster-deploy-vps queda como alternativa documentada). Cubre tokens de Cloudflare, preflight de dominio, infra/cloudflare, Neon, Doppler, R2, Cloudflare Queues, los tres primeros deploys, el orden estricto de Turnstile, Cloudflare Access delante del admin, SMTP, y verificación post-deploy. Requiere que disaster-configure, disaster-brand y disaster-secrets-bootstrap (en su variante Doppler) ya hayan corrido.
---

# disaster-deploy-cloudflare

Camino **primario** de despliegue de este template: tres Workers de Cloudflare
(frontend y admin vía `@opennextjs/cloudflare`, backend vía
`httpServerHandler(server)` — ver `backend/src/worker.ts`) contra Neon
Postgres (driver HTTP, no TCP), con Doppler como fuente de todos los
secretos. `disaster-deploy-vps` (VPS único + `docker-compose.prod.yml`)
sigue documentado como **alternativa** — es el único camino donde
transacciones interactivas de Drizzle y el worker BullMQ/Valkey funcionan sin
reescribir nada; ver la sección "Qué NO funciona en este camino" más abajo
antes de asumir paridad total con el VPS.

Este skill es largo porque el camino tiene muchas piezas externas (Cloudflare,
Neon, Doppler, opcionalmente Resend) que fallan de formas silenciosas si se
configuran fuera de orden. Sigue los pasos en el orden dado — casi todos los
fallos documentados aquí vinieron de saltarse un paso o invertir dos.

## Prerequisitos (gate — verifica antes de tocar infra)

1. `config/deployment.config.json` sin valores de `example.org`/"Ejemplo"
   (`disaster-configure` corrió).
2. `docs/DESIGN.md` / `frontend/app/globals.css` con la paleta real
   (`disaster-brand` corrió).
3. `disaster-secrets-bootstrap` corrió en su variante Doppler (ver ese
   skill) — necesitas el proyecto Doppler ya creado con sus configs `prd`/
   `stg`, aunque todavía les falten los secretos que este skill termina de
   rellenar (Neon, R2, Cloudflare, Turnstile). Si no existe el proyecto
   Doppler, corre ese skill primero.
4. **`TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY` van a quedar
   configuradas antes del primer tráfico público real, O el deployer ya dio
   autorización explícita por escrito para ir a producción sin anti-bot.**
   No lo des por hecho — si no ves esa autorización en la conversación,
   pregúntale antes de seguir (mismo hard-stop que `disaster-secrets-bootstrap`
   y `disaster-deploy-vps`).
5. **Espacio en disco > 5GB libres** en la máquina desde la que vas a correr
   `tofu`/`wrangler`/`npm`:
   ```bash
   df -h . | tail -1
   ```
   Un disco lleno no solo rompe el build a medias — puede corromper Docker
   Desktop (si lo tienes instalado para dev local) de forma persistente
   (crash-loop que sobrevive a liberar espacio), y resetearlo puede borrar
   volúmenes de otros proyectos. Revisa esto ANTES de cualquier build, no
   después de que uno falle a medias.

Si cualquiera de 1–4 falla, detente y corre (o resuelve) el paso que falte
primero.

## Qué necesitas del deployer

- Cuenta de Cloudflare (el plan Free alcanza para todo lo de este skill:
  Workers, R2, Queues, Turnstile, Access con hasta 50 usuarios/mes).
- Cuenta de Neon (Postgres serverless — el plan Free alcanza para lanzar).
- Cuenta de Doppler (el plan Free alcanza para un proyecto con dos configs).
- El/los dominio(s) reales, con acceso al panel del registrador/DNS.
- `gh auth login` ya corrido si vas a usar los workflows de GitHub Actions
  para desplegar (recomendado) en vez de `wrangler deploy` a mano.
- Opcional: cuenta de Resend (u otro SMTP transaccional) si vas a activar
  invitaciones/reset de contraseña por correo — ver la sección SMTP.

## 0. Día cero: herramientas locales

```bash
brew install opentofu               # o el gestor de paquetes de tu SO
brew install doppler/doppler/doppler || curl -Ls https://cli.doppler.com/install.sh | sh
gh auth login                       # si vas a usar los workflows de Actions
```

**Escopa el login de Doppler al directorio de este repo**, no lo hagas
global — si la máquina ya tiene otro workplace de Doppler autenticado (otro
cliente, otro proyecto), un `doppler login` global lo sobreescribe en
silencio:

```bash
doppler login --scope "$(pwd)"
```

## 1. Los dos tokens de Cloudflare — antes de tocar infra

Cloudflare no tiene un token único que cubra zona (DNS/settings/WAF/DNSSEC) Y
cuenta (Workers/R2/Turnstile/Queues/Access). Necesitas los dos, con los
permisos exactos, **antes** del primer `tofu apply` o `wrangler deploy` —
descubrirlos a base de 403 a mitad de lanzamiento cuesta una ronda completa
de ida y vuelta al dashboard por cada permiso que falta.

La tabla completa de permisos (token de zona y token de cuenta) vive en
**`infra/cloudflare/README.md`, sección "Dos tokens"** — créalos ahí, no los
reinventes aquí. Guarda ambos directamente en Doppler (`prd`, y si tu cuenta
de Cloudflare es la misma para staging, reutilízalos también en `stg`):

```bash
doppler secrets set CLOUDFLARE_ZONE_API_TOKEN --project <tu-proyecto-doppler> --config prd
doppler secrets set CLOUDFLARE_ACCOUNT_API_TOKEN --project <tu-proyecto-doppler> --config prd
doppler secrets set CLOUDFLARE_ACCOUNT_ID --project <tu-proyecto-doppler> --config prd
```

(`doppler secrets set NOMBRE` sin `--value` te pide el valor de forma
interactiva — así el token nunca queda en tu historial de shell.)

## 2. Preflight de dominio — antes de crear la zona

No asumas que el dominio que te dio el deployer es el que realmente
controla. Verifica ANTES de crear la zona en Cloudflare o de tocar DNS:

```bash
dig NS <tu-dominio> +short
whois <tu-dominio> | grep -i "registrar\|creation date"
```

**Refuse y pregunta si:**
- Los NS actuales no apuntan ya a Cloudflare Y el deployer no puede
  confirmar que es dueño del registrador que sí aparece.
- La fecha de creación del dominio es de hoy o de los últimos días (normal en
  un lanzamiento de emergencia legítimo, pero también el patrón exacto de un
  dominio de phishing oportunista sobre el mismo desastre).
- Existen variantes "lookalike" del mismo nombre en otros TLD (`.com`,
  `.org`, `.app`, guiones, typos) registradas el mismo día o antes que el
  dominio real — un lanzamiento previo de este mismo template encontró tres
  dominios lookalike registrados el mismo día, uno de ellos 99 segundos
  antes del dominio legítimo. Avisa al deployer de esto explícitamente
  aunque no bloquee el despliegue — es información que necesita para avisar
  a la prensa/redes de cuál es el dominio real.

Una vez confirmado, crea la zona en Cloudflare (dashboard o
`cloudflare_zone` en el módulo si tu fork lo gestiona ahí) antes de seguir a
infra.

## 3. `infra/cloudflare` — DNS, TLS, WAF, rate-limit, DNSSEC

```bash
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars   # rellena con los valores reales
tofu init
doppler run --project <tu-proyecto-doppler> --config prd -- ./tf plan
doppler run --project <tu-proyecto-doppler> --config prd -- ./tf apply
```

Lee `infra/cloudflare/README.md` completo antes de este paso — cubre el
orden `ssl_mode = "full"` → `"strict"`, la política de deriva (`tofu plan`
antes de cada `apply`, nunca revertir en silencio un ajuste manual
deliberado), y por qué las Cache Rules de zona son un no-op para un Worker
en dominio propio (cachea dentro del Worker con `caches.default` si lo
necesitas, no en `cache.tf`).

`tofu apply` saliendo en verde **no es prueba** de que el ajuste tomó
efecto — verifica siempre contra la API real:

```bash
CLOUDFLARE_API_TOKEN=<token-de-zona> CLOUDFLARE_ZONE_ID=<zone-id> ./verify-settings.sh
```

Si tu dominio se registra en otro proveedor que no es Cloudflare, el DS de
DNSSEC (`tofu output dnssec_ds`) hay que copiarlo a mano al panel de ESE
registrador — Cloudflare no puede hacerlo por ti (ver README de
`infra/cloudflare` para el formato exacto).

## 4. Neon — producción y staging

1. Crea el proyecto en [neon.tech](https://neon.tech) o con
   `neon projects create`.
2. Si el dashboard te ofrece `neon init --agent` (onboarding guiado), puedes
   correrlo — escribe un `.neon` de solo `{orgId, projectId}` en la raíz del
   repo, sin secretos (la connection string sigue viviendo en Doppler). Es
   seguro de commitear en el fork REAL de un deployer una vez desplegado; no
   lo commitees en este template genérico.
3. Crea una rama `staging` **desde el esquema, no desde datos reales**:
   ```bash
   neon branches create --name staging --parent production
   ```
   Si tu fork ya tiene datos reales de personas en `production` cuando creas
   esta rama, **purga las tablas con PII de la rama staging inmediatamente**
   (mantén solo catálogos no-PII como el de sismos) — una rama de Neon es una
   copia completa, y `staging.<tu-dominio>` normalmente no tiene la misma
   protección Turnstile/Access que producción. Bifurcar una rama con PII
   real hacia un dominio público menos protegido duplica la superficie de
   exposición, no la reduce.
4. **`neon connection-string` imprime la contraseña en texto plano en tu
   terminal.** Nunca la dejes ahí — pipe directo a Doppler, nunca a un
   archivo ni a un mensaje de chat:
   ```bash
   neon connection-string production --pooled | doppler secrets set DATABASE_URL --project <tu-proyecto-doppler> --config prd --pipe
   neon connection-string staging --pooled | doppler secrets set DATABASE_URL --project <tu-proyecto-doppler> --config stg --pipe
   ```
   Si el valor ya quedó impreso en una terminal/transcript, trátalo como
   filtrado: la única remediación de Neon es borrar y recrear la rama (no
   hay rotación de contraseña directa por CLI).
5. Guarda la connection string **pooled** (la que acabas de pipear) como
   `DATABASE_URL` — es la que usa el driver HTTP de Neon en runtime
   (`backend/src/db/index.ts`). Para migraciones usa
   `scripts/migrate-direct.sh`, que deriva el endpoint directo (no-pooler)
   de esa misma URL quitándole el sufijo `-pooler` del host — no necesitas
   guardar una segunda variable a propósito:
   ```bash
   doppler run --project <tu-proyecto-doppler> --config prd -- bash scripts/migrate-direct.sh DATABASE_URL
   ```
   (Si el connection string de tu proyecto Neon NO sigue el patrón
   `<algo>-pooler.<region>.aws.neon.tech` — por ejemplo, un proveedor Postgres
   distinto de Neon con el driver HTTP — guarda explícitamente un
   `DATABASE_URL_DIRECT` en Doppler y pásalo como argumento a
   `migrate-direct.sh` en su lugar.)

## 5. Doppler — layout de proyecto y nombres exactos de secretos

Dos configs, `prd` y `stg`, dentro de un único proyecto Doppler. Nombres
EXACTOS — el código los lee tal cual, y un nombre distinto (p.ej.
`CLOUDFLARE_ACCESS_KEY_ID` en vez de `R2_ACCESS_KEY_ID`) es un secreto que
"está puesto" en Doppler pero invisible para la app:

| Secreto | `[REQ]`/`[OPT]` | Generación |
|---|---|---|
| `DATABASE_URL` | REQ | connection string pooled de Neon (paso 4) |
| `JWT_SECRET` | REQ | `openssl rand -hex 32` |
| `IP_SALT` | REQ | `openssl rand -hex 16` |
| `PATIENT_DOCUMENT_HASH_SECRET` | REQ | `openssl rand -hex 32` |
| `SEED_ADMIN_EMAIL` | REQ | `contactEmail` de `deployment.config.json` |
| `SEED_ADMIN_PASSWORD` | REQ | `openssl rand -base64 24` |
| `ADMIN_PASSWORD` | REQ (ver nota) | `openssl rand -base64 12` |
| `CORS_ORIGINS` / `APP_BASE_URL` / `ADMIN_BASE_URL` | REQ | derivados de `domains.*` — ver `disaster-secrets-bootstrap` |
| `CLOUDFLARE_ZONE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | REQ | paso 1 |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | REQ (o autorización explícita) | ver sección Turnstile — orden estricto |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` / `R2_STATIC_BUCKET` / `R2_PUBLIC_BASE` / `NEXT_PUBLIC_R2_PUBLIC_BASE` | OPT (fotos) | ver sección R2 |
| `R2_KEY_PREFIX` | OPT, solo `stg` | literal `staging` — separa objetos de staging de los de prod en el mismo bucket |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` | OPT | ver sección SMTP/Resend |
| `EARTHQUAKES_MIN_LAT` / `MAX_LAT` / `MIN_LNG` / `MAX_LNG` | REQ si vas a activar el sync de sismos | bbox real de la región — `getBbox()` lanza si falta cualquiera |
| `GEOCODE_BIAS_LAT` / `GEOCODE_BIAS_LNG` / `GEOCODE_COUNTRY_CODE` | OPT | sesga/restringe el geocoder Nominatim a tu región |
| `DOPPLER_TOKEN` / `DOPPLER_TOKEN_STAGING` | REQ para CI | tokens de servicio de Doppler — van como **secrets de GitHub**, no como secretos DENTRO de Doppler (ver paso 8) |

`ADMIN_PASSWORD` está marcado REQ aquí (a diferencia de `.env.example`, que
lo trata como opcional) porque en este camino no tienes acceso SSH al Worker
para correr un script de limpieza a mano — sin ella, el endpoint
DELETE admin-gated es la única forma de borrar un registro de prueba, y sin
la contraseña ni siquiera esa puerta existe.

No inventes valores para `SMTP_*`/`R2_*` si el deployer no va a activar esas
integraciones todavía — déjalos vacíos, el código ya degrada de forma
documentada (ver `.env.example`).

## 6. R2 — fotos y estáticos

```bash
# Dashboard: R2 → Create bucket
```
Nombre del bucket: `<slug-del-despliegue>-media` (de-brandeado — nunca
reutilices un nombre de otro despliegue).

Adjunta un dominio CDN propio al bucket (`cdn.<tu-dominio>`, crea el DNS
record) y espera a que el certificado TLS quede activo antes de continuar.

Guarda las credenciales en Doppler bajo los nombres EXACTOS de la tabla de
arriba — no bajo el nombre que te dé el dashboard al crear el token R2
(suele sugerir `CLOUDFLARE_ACCESS_KEY_ID`/`CLOUDFLARE_SECRET_ACCESS_KEY`,
que no es lo que el código lee). Copia entre variables dentro de Doppler si
hace falta, nunca mostrando el valor:

```bash
doppler secrets get CLOUDFLARE_ACCESS_KEY_ID --project <p> --config prd --plain \
  | doppler secrets set R2_ACCESS_KEY_ID --project <p> --config prd --pipe
```

Para staging, además de las mismas credenciales, fija `R2_KEY_PREFIX=staging`
— sin esto, objetos de prueba de staging y fotos reales de producción
comparten el mismo espacio de claves en el mismo bucket.

## 7. Cloudflare Queues — antes del primer deploy del backend

**`wrangler deploy` no crea las colas por ti.** `backend/wrangler.jsonc`
declara los bindings; si la cola no existe ya en tu cuenta, el primer deploy
falla con un error de API opaco (código 10013) — no es un fallo transitorio,
es un recurso que falta. Crea las OCHO colas (producción + staging, cada una
con su DLQ) antes del primer `wrangler deploy` del backend:

```bash
doppler run --project <tu-proyecto-doppler> --config prd -- bash -c '
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-needs
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-needs-dlq
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-imports
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-imports-dlq
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-needs-staging
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-needs-dlq-staging
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-imports-staging
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_ACCOUNT_API_TOKEN" npx wrangler queues create <slug>-imports-dlq-staging
'
```

(`<slug>` = el mismo prefijo que ya pusiste en los nombres de cola de
`backend/wrangler.jsonc`, p.ej. `ejemplo-emergencia` de-brandeado a lo real
por `disaster-configure`.) `deploy-backend.yml` ya trae un paso de
pre-flight que compara colas declaradas contra `wrangler queues list` y
falla el deploy con el comando exacto si falta alguna — pero ese paso solo
DETECTA el problema, no lo arregla; corre el bloque de arriba tú mismo antes
del primer deploy para no descubrirlo ahí.

## 8. Primeros deploys — staging primero, luego producción

1. **GitHub Environments/secrets**, si vas a desplegar desde Actions (la
   forma recomendada — `deploy-frontend.yml` autodespliega en push a `main`
   filtrado por path; `deploy-backend.yml`/`deploy-admin.yml` son manuales
   con confirmación tipeada; `deploy-staging.yml` autodespliega los tres a
   staging):
   ```bash
   gh secret set DOPPLER_TOKEN --body "<token de servicio Doppler, config prd>"
   gh secret set DOPPLER_TOKEN_STAGING --body "<token de servicio Doppler, config stg>"
   ```
   Estos son los ÚNICOS secretos que GitHub Actions necesita — todo lo
   demás (tokens de Cloudflare, credenciales R2, JWT, etc.) lo inyecta
   `doppler run` dentro de cada workflow, nunca vive duplicado en GitHub.
2. Despliega frontend + backend + admin a **staging** primero (push a
   `staging` si existe esa rama, o dispara `deploy-staging.yml` a mano) y
   corre los smoke checks de la sección "Verificación final" contra
   staging antes de tocar producción.
3. Solo entonces, producción: push a `main` (frontend autodespliega) y
   `gh workflow run deploy-backend.yml -f confirmar=desplegar` /
   `gh workflow run deploy-admin.yml -f confirmar=desplegar` para backend y
   admin (manuales a propósito — ver el comentario de cabecera de esos
   workflows). **Confirma la rama/ref en la pantalla de "Run workflow"
   antes de escribir la palabra de confirmación** — un run posterior
   lanzado desde otra rama sobreescribe en silencio el deploy anterior, sin
   merge y sin comparación de ref.
4. `wrangler secret bulk`/`wrangler secret put` es un paso APARTE de
   `doppler secrets set` — **Doppler no sincroniza secretos a Workers por sí
   solo**. Los workflows de este template ya lo hacen por ti vía
   `doppler run`, pero si alguna vez empujas un secreto a mano fuera de CI,
   recuerda este paso.
5. Un secreto recién empujado a un Worker tarda **30–60 segundos** en
   llegar a los isolates ya calientes en todos los PoPs de Cloudflare. Una
   sola sonda inmediatamente después de un push puede leer un estado
   "inactivo" que en realidad es solo propagación en curso, no un fallo —
   espera o reintenta antes de declarar roto un cambio de secreto recién
   hecho.

## 9. Turnstile — orden ESTRICTO, no lo inviertas

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` se incrusta en el bundle del frontend EN
BUILD TIME. Si el backend exige el token (`TURNSTILE_SECRET_KEY`) antes de
que el frontend desplegado lleve la site key, el 100% de los envíos de
escritura pública (reportes, desaparecidos, mascotas, contacto, donaciones,
eliminación de datos) empiezan a fallar con 403, en silencio, sin que nada
en los logs lo señale como "Turnstile mal configurado" — esto ya ocurrió en
un lanzamiento real de este template.

Orden obligatorio, cada paso verificado antes del siguiente:

1. Crea el widget de Turnstile en el dashboard de Cloudflare (cuenta →
   Turnstile). Copia site key + secret key.
2. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` a Doppler (`prd` y `stg`).
3. Redespliega el **frontend** (paso 8) — esta variable solo toma efecto en
   un build nuevo, no en un redeploy de configuración.
4. Corre `scripts/verify-turnstile.sh <staging|production>` y confirma que
   reporta la site key presente en el bundle servido. El script escanea
   `/solicitar-borrado` (una ruta que SÍ monta un formulario protegido) por
   defecto — con el chunking por ruta de Next/Turbopack, escanear el home no
   basta, el hook de Turnstile solo se sirve en chunks de páginas que
   realmente montan el widget.
5. **Solo entonces** pon `TURNSTILE_SECRET_KEY` en Doppler y redespliega el
   backend (paso 8).
6. Vuelve a correr `scripts/verify-turnstile.sh` — ahora debe confirmar
   también que el backend exige el token (paso 2 del script). El script
   inspecciona el cuerpo de la respuesta del endpoint protegido, no solo el
   código HTTP — un 403 del WAF de borde de Cloudflare y un 403 de rechazo
   propio de Turnstile pueden coincidir en código pero no en forma.

Si por cualquier motivo despliegas producción sin Turnstile (autorización
explícita del prerequisito 4), dilo en voz alta en la verificación final —
no lo dejes como un silencio que alguien interpreta después como "ya está
protegido".

## 10. Cloudflare Access delante del admin en producción (opcional, recomendado)

Capa de identidad EN EL BORDE (quién llega siquiera a la pantalla de login),
separada del RBAC de la app (qué puede hacer una vez dentro). Ninguna
sustituye a la otra.

1. Los permisos de token que necesitas (`Access: Organizations, Identity
   Providers, and Groups: Edit`, `Access: Apps and Policies: Edit`,
   `Access: Audit Logs: Read`) ya están en la tabla de token de cuenta de
   `infra/cloudflare/README.md` — confírmalos ahí antes de crear la app de
   Access, no los descubras a base de 403.
2. Crea una app de Access sobre `admin.<tu-dominio>` con política de login
   por OTP de email + allowlist de correos.
3. **Crea un bypass de Access para exactamente `/api/health`** (o la ruta
   que use el smoke check de `deploy-admin.yml`) — sin este bypass, el
   check post-deploy recibe un redirect de login en vez de un 200 y el
   deploy se ve roto sin estarlo.
4. Añadir un teammate es un paso EN DOS SITIOS: allowlist su email en la
   política de Access (arriba) Y, por separado, invítalo desde la propia
   pantalla `/users` del panel (RBAC de la app). Uno sin el otro deja a esa
   persona con acceso de borde pero sin rol, o con rol pero bloqueada en el
   borde.
5. Staging normalmente se deja SIN Access (fricción extra en un entorno de
   pruebas de bajo riesgo) — decisión explícita del deployer, no un
   descuido; dilo así en la verificación final.

## 11. SMTP vía Resend (opcional pero recomendado)

Sin esto, las invitaciones de admin son links copiados a mano y el reset de
contraseña por OTP solo llega a los logs del servidor — ningún reset
funciona para un usuario real.

1. Resend dashboard → Add Domain → tu dominio de envío (normalmente un
   subdominio dedicado, no el apex).
2. Resend te da 3 registros DNS (TXT DKIM, MX de retorno de bounces, TXT
   SPF). NO los pegues solo en el dashboard de Cloudflare — **impórtalos al
   módulo de Terraform** (`infra/cloudflare/resend.tf`, activa
   `smtp_provider = "resend"` y `resend_dkim_public_key`) para que
   `tofu plan` los conozca y una rotación futura de la clave DKIM aparezca
   como drift en vez de desincronizarse en silencio.
3. Crea una API key de solo-envío en Resend, guárdala como `SMTP_PASSWORD`
   en Doppler junto con `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_FROM`
   (`prd` y `stg`).
4. Verifica con un envío de prueba real antes de dar el paso por terminado.

## Qué NO funciona en este camino (léelo antes de "arreglar" nada)

- **Transacciones interactivas de Drizzle** (`db.transaction(fn)`) — el
  driver HTTP de Neon usado en Workers no puede mantener una transacción
  abierta entre statements (una conexión pooled no sobrevive entre llamadas
  HTTP con scope de isolate). `backend/src/services/patient-imports/apply.ts`
  y `backend/src/services/roles.ts` muestran los tres patrones sustitutos
  (claim condicional vía `UPDATE ... RETURNING`, ids determinísticos +
  `ON CONFLICT`, compensación secuencial). El ESLint rule
  `backend/eslint-rules/index.js:no-interactive-transactions` lo bloquea en
  CI para `backend/src/**` (exento `backend/worker/**`, que corre bajo
  Node/node-postgres en el camino VPS, donde sí funciona).
- **El worker BullMQ/Valkey** (`backend/worker/`) no puede correr en
  Workers en absoluto. Jobs de fondo van por Cron Triggers
  (`backend/src/services/cron-jobs.ts`) + Cloudflare Queues
  (`backend/src/lib/queue-consumer.ts`, `backend/src/lib/job-dispatch.ts`)
  en su lugar.
- **Rate-limit compartido de verdad** — `VALKEY_URL` normalmente se deja sin
  configurar en este camino (una conexión TCP persistente a Redis tiene el
  mismo problema de ciclo-de-vida-por-isolate que `node-postgres`). El
  rate-limit corre en modo degradado (memoria por isolate), respaldado por
  el rate-limit de borde de Cloudflare (`infra/cloudflare/ratelimit.tf`).
  Tradeoff aceptado de esta topología, no un bug pendiente.
- `backend/wrangler.jsonc` deliberadamente NO declara binding de Hyperdrive
  ni de D1 — el driver de Workers es el HTTP de Neon, que necesita una URL
  de Neon de verdad; un binding de Hyperdrive "por si acaso" rompe casi
  todas las consultas si algo lo inyecta como `DATABASE_URL`.

## Verificación final (obligatoria antes de anunciar el despliegue)

1. `scripts/verify-turnstile.sh <staging|production>` — ambos pasos en
   verde (site key en bundle, backend exige token), a menos que el
   prerequisito 4 esté explícitamente autorizado sin Turnstile.
2. `scripts/verify-jobs.sh <staging|production>` — smoke check de
   solo-lectura de frescura de jobs de fondo, seguro de correr en
   producción.
3. **Un envío de prueba real de punta a punta**, con datos obviamente
   ficticios (nunca una persona real), por la UI pública — y BÓRRALO
   después (vía el endpoint DELETE admin-gated, que necesita
   `ADMIN_PASSWORD` — ver paso 5) antes de dar el despliegue por cerrado. No
   dejes un registro `DEMO-` colgando en producción por costumbre.
4. **Verificación por hash de build**, no solo HTTP 200 — ver la siguiente
   sección.

## Cómo verificar que un deploy realmente cambió lo servido

Un `wrangler deploy` en verde y un `curl` en 200 NO son prueba de que el
tráfico real está en la versión nueva:

- **La caché de zona de Cloudflare** puede servir el HTML pre-deploy durante
  varios minutos (`s-maxage`) incluso después de un deploy exitoso.
  `?cb=<timestamp>` como query string **no la revienta** (Next.js no varía
  la caché por query string arbitraria). Compara el hash del chunk de build
  servido (`turbopack-*.js` o el que use tu build) contra el commit/SHA del
  log de deploy, o pega directo al origen sin caché de zona
  (`*.workers.dev`, que bypassea la zona) para confirmar qué versión
  responde de verdad.
- `deploy-backend.yml` ya deja esto resuelto por ti para la API (compara
  `wrangler deployments list --json` contra el SHA desplegado y falla el
  workflow si no coinciden) — para frontend/admin, si verificas a mano,
  usa el mismo principio: no confíes en el código HTTP solo, confía en un
  marcador específico de esta build.

## Diagnóstico — logs del propio Worker y cold-start de Neon vs. isolate

**Logs del Worker (Workers Observability), en vez de adivinar por un 5xx:**
la API de observability de Cloudflare exige que CADA filtro lleve su tipo
explícito (`"type": "string"`, etc.) — un filtro sin tipo se rechaza con
400 en vez de simplemente no filtrar, y el resultado se limita a ~50
eventos más recientes primero (sin paginación por offset — si necesitas
más, acota la ventana de tiempo, no pidas una página siguiente):

```bash
doppler run --project <tu-proyecto-doppler> --config prd -- bash -c '
  curl -s -X POST \
    -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/observability/telemetry/query" \
    -d "{
      \"queryId\": \"diag-$(date +%s)\",
      \"view\": \"events\",
      \"timeframe\": {\"from\": $(( $(date +%s) - 3600 ))000, \"to\": $(date +%s)000},
      \"filters\": [
        {\"key\": \"\$metadata.service\", \"operation\": \"eq\", \"value\": \"<nombre-del-worker>\", \"type\": \"string\"}
      ],
      \"limit\": 50
    }"
'
```
(Los nombres exactos de campo del endpoint de observability evolucionan con
la API de Cloudflare — si este payload devuelve un error de esquema, revisa
la documentación actual de `workers/observability`; lo que no cambia es la
mecánica: cada filtro necesita un `type` explícito y el resultado tiene un
techo de ~50, ordenado del más reciente al más antiguo.)

**"El Worker está lento" casi siempre es Neon, no el isolate.** Un cold
start de isolate y un cold start de cómputo de Neon (autosuspend tras
inactividad) se ven idénticos desde fuera ("se quedó cargando"). Distínguelos
con una sonda A/B: pide `/api/healthz` (sin I/O — mide solo el isolate) y
`/api/readyz` (hace un `SELECT 1` — mide isolate + Neon) varias veces
seguidas tras un período de inactividad de varios minutos:

```bash
for path in healthz readyz; do
  echo "== $path =="
  time curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" "https://<tu-api>/api/$path"
done
```

Si `healthz` responde rápido y `readyz` tarda varios segundos, es Neon
despertando, no el Worker. Mantener Neon caliente (autosuspend más largo,
un cron de keepalive) es una decisión del mantenedor porque cambia la
factura de Neon — no la tomes por tu cuenta, solo diagnostica y reporta cuál
de las dos capas es.

## Hard stop

No anuncies el despliegue como listo si:
- Cualquier prerequisito (1–4 de arriba) no se cumplió.
- Falta cualquier cola de Cloudflare Queues declarada en `wrangler.jsonc`
  (paso 7) — el primer deploy del backend fallará con el error 10013.
- El orden de Turnstile se invirtió (secreto del backend antes que la site
  key confirmada en el bundle del frontend).
- El bypass de Access para `/api/health` no existe y Access está activo
  delante del admin — el smoke check de `deploy-admin.yml` fallará en cada
  deploy futuro.
- No verificaste el hash/versión de build realmente servida, solo un HTTP
  200.
- Un registro `DEMO-`/de prueba quedó sin borrar en producción tras la
  verificación final.

## Siguiente paso

Con los tres Workers desplegados y verificados, continúa con
`disaster-content-audit` sobre el árbol completo antes de que el fork del
deployer se haga público — este skill no reemplaza esa revisión.
