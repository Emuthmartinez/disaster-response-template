---
name: disaster-secrets-bootstrap
description: Genera valores aleatorios fuertes (openssl rand) para cada secreto [REQ] del contrato documentado en .env.example, y los entrega por UNA de dos vías — .env/.prod.env local (camino VPS, nunca se commitea) o un proyecto Doppler con configs prd/stg (camino Cloudflare Workers, ver disaster-deploy-cloudflare). Rehúsa declararse terminado mientras quede CHANGE_ME o un valor de example.org en una variable [REQ], y rehúsa REGENERAR nada si el despliegue ya parece estar en vivo, salvo confirmación explícita del deployer.
---

# disaster-secrets-bootstrap

Tercer paso del standup (después de `disaster-configure` y `disaster-brand`,
antes de `disaster-deploy-cloudflare`/`disaster-deploy-vps`). Convierte el
contrato documentado en `.env.example` en secretos reales, generados y con
los valores de identidad/dominio ya resueltos por `disaster-configure`.
Entrega esos secretos por una de dos vías — ver "Dos vías de entrega" más
abajo — según qué camino de despliegue vaya a usar el fork.

## Re-run guard — antes de generar NADA

**Este skill genera secretos aleatorios NUEVOS cada vez que corre.** Eso es
correcto la primera vez (standup de un fork nuevo) y es DESTRUCTIVO si el
despliegue ya está en vivo:

- Regenerar `JWT_SECRET` invalida toda sesión abierta — cada usuario logueado
  (incluido el admin) queda deslogueado al instante.
- Regenerar `PATIENT_DOCUMENT_HASH_SECRET` o `IP_SALT` desincroniza los hashes
  ya escritos en una base de datos real — deduplicación de pacientes y
  rate-limit por IP quedan rotos de forma silenciosa e irreversible (no hay
  "recalcular" retroactivo, los hashes viejos ya no calzan con nada nuevo).

Antes de generar un solo secreto, comprueba si esto parece un despliegue ya
en vivo:

```bash
grep -in "ejemplo\|example.org" config/deployment.config.json
```

Si esto NO devuelve nada (es decir, `deployment.config.json` ya tiene
identidad real, no de ejemplo) **Y** ya existe un `.env`/`.prod.env` con
secretos no-`CHANGE_ME`, o un proyecto Doppler con configs `prd`/`stg` ya
pobladas — **detente**. No asumas que "correr este skill de nuevo" es lo
que se te pidió solo porque alguien dijo "genera los secretos" en genérico.
Pregúntale explícitamente al deployer: *"esto parece un despliegue que ya
tiene identidad y secretos reales — ¿confirmas que quieres REGENERAR
`JWT_SECRET`/`PATIENT_DOCUMENT_HASH_SECRET`/`IP_SALT`, sabiendo que
deslogueará a todos los usuarios y romperá la deduplicación/rate-limit ya
escrita?"*. Solo continúa si responde que sí, por escrito, en la
conversación — esa respuesta es el registro de la decisión. Si lo que
necesita es rotar UN secreto puntual (p.ej. un token de API filtrado), rota
solo ese, a mano, no relances todo este skill.

Este mismo guard aplica corriendo por segunda vez sobre el MISMO fork
todavía no desplegado (p.ej. reintentando tras un error) — ahí sí es seguro
regenerar todo, porque nada en producción depende aún de los valores
anteriores. La señal que te dice cuál caso es este es si `deployment.config.json`
tiene identidad real Y hay secretos ya escritos en el destino (`.env` o
Doppler) — no la sola existencia de un `.env`/proyecto Doppler vacío o a
medias.

## Antes de empezar

- `.env` y `.env.*` (excepto `.env.example`) ya están en `.gitignore` — nunca
  los agregues a git tú mismo, y nunca imprimas su contenido completo en un
  mensaje que pueda quedar en un log público. Lo mismo aplica a cualquier
  valor que pases por `doppler secrets set`: usa el prompt interactivo o
  `--pipe`, nunca `--value` en la línea de comandos si hay alternativa (los
  argumentos de un comando quedan en el historial del shell).
- Este skill asume que `config/deployment.config.json` ya tiene los dominios
  reales (`domains.web/api/admin`) y el `contactEmail` real — si no, corre
  `disaster-configure` primero.
- **Disciplina de nombres exactos.** Cuando un paso de abajo te pide pegar
  una credencial que generaste en OTRO dashboard (R2, Turnstile, Resend...),
  ese dashboard casi nunca sugiere el nombre que el código realmente lee. Un
  lanzamiento real de este template pegó las claves de R2 bajo
  `CLOUDFLARE_ACCESS_KEY_ID`/`CLOUDFLARE_SECRET_ACCESS_KEY` (el nombre que
  el flujo de creación del token sugería) en vez de
  `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (el nombre que
  `backend/src/lib/r2.ts` realmente lee) — el secreto "estaba puesto" pero
  invisible para la app. Cada tabla de este skill te da el nombre EXACTO en
  `código`; escribe ese nombre literal, nunca el que sugiera el dashboard de
  origen, y verifica después con un `grep`/`doppler secrets get` que quedó
  bajo ese nombre.

## Dos vías de entrega: `.env` vs Doppler

Los VALORES que genera este skill (sección "Qué hace" abajo) son los mismos
sea cual sea el camino de despliegue. Lo que cambia es DÓNDE aterrizan:

### Vía A — `.env`/`.prod.env` (camino `disaster-deploy-vps`)

Un archivo local, gitignored, copiado al VPS por un canal seguro (`scp`,
nunca pegado en un chat). Es la vía que documentan el resto de las secciones
de este skill tal como están escritas — síguelas literal si tu fork usa el
VPS.

### Vía B — Doppler (camino `disaster-deploy-cloudflare`, recomendado)

Cloudflare Workers no lee un `.env` — los tres Workers (frontend/API/admin)
reciben secretos vía `wrangler secret bulk` desde variables de entorno que
CI inyecta con `doppler run`. En vez de escribir un archivo, escribes
directo a Doppler:

1. Crea (si no existe) UN proyecto Doppler para el fork, con dos configs:
   `prd` (producción) y `stg` (staging). Nombra el proyecto algo
   identificable del despliegue, no genérico (`<slug-del-despliegue>`, nunca
   reutilices el nombre de otro despliegue de este template).
2. Cada secreto de las tablas de abajo se escribe con:
   ```bash
   doppler secrets set NOMBRE_EXACTO --project <tu-proyecto-doppler> --config prd
   # (te pide el valor de forma interactiva — nunca queda en el historial)
   ```
   Repite para `--config stg` con SU PROPIO valor generado — nunca copies el
   mismo secreto de `prd` a `stg` (una sesión de staging válida en
   producción, o viceversa, es exactamente lo que este split evita).
3. **GitHub Actions solo necesita conocer DOS secretos**, nunca los
   individuales: un token de servicio de Doppler por config, guardado como
   secret de repo:
   ```bash
   gh secret set DOPPLER_TOKEN --body "<token de servicio Doppler, config prd>"
   gh secret set DOPPLER_TOKEN_STAGING --body "<token de servicio Doppler, config stg>"
   ```
   Los workflows de este template (`deploy-backend.yml`, `deploy-frontend.yml`,
   `deploy-admin.yml`, `deploy-staging.yml`, `verify-jobs.yml`) ya están
   escritos para leer exactamente estos dos nombres — no inventes otros.
4. Ningún secreto individual (JWT_SECRET, credenciales de R2, tokens de
   Cloudflare...) vive nunca en GitHub — solo en Doppler, inyectado en cada
   paso del workflow vía `doppler run --command '...'`.
5. Genera un token de servicio por config desde el dashboard de Doppler
   (Project → Access → Service Tokens) o `doppler configs tokens create`,
   con el mínimo scope (`read`, no `admin`) que cada workflow necesita.

El resto de este skill (qué generar, qué secretos son `[REQ]`/`[OPT]`, el
tratamiento aparte de Turnstile) aplica igual a ambas vías — la única
diferencia es el comando de escritura final (`.env` con un editor/heredoc vs
`doppler secrets set`). La tabla completa de nombres de secreto específicos
del camino Cloudflare (`DATABASE_URL` de Neon, `R2_*`, `CLOUDFLARE_*`,
`SMTP_*` para Resend) vive en `disaster-deploy-cloudflare` — este skill
cubre el núcleo compartido con el camino VPS (JWT/hash/salt/admin), ese
otro skill añade lo específico de Cloudflare/Neon/R2/Resend encima.

## Qué hace

1. Lee `.env.example` completo y separa las variables en tres grupos:
   - **Secretos `[REQ]`** — variables marcadas `[REQ]` cuyo propósito es un
     secreto criptográfico o contraseña (no una URL/dominio/email). En este
     repo, ese conjunto es:
     - `JWT_SECRET` — `openssl rand -hex 32`
     - `IP_SALT` — `openssl rand -hex 16`
     - `PATIENT_DOCUMENT_HASH_SECRET` — `openssl rand -hex 32`
     - `SEED_ADMIN_PASSWORD` — `openssl rand -base64 24`
     - `POSTGRES_PASSWORD` — `openssl rand -base64 24`
     - `VALKEY_PASSWORD` — `openssl rand -base64 24`
   - **Secretos `[OPT]` recomendados** (tienen un default sano en código,
     pero conviene generarlos igual en producción):
     - `ADMIN_PASSWORD` — `openssl rand -base64 12`
     - `CRON_SECRET` — `openssl rand -hex 24`
     - `METRICS_TOKEN` — `openssl rand -hex 24`
   - **Identidad/dominio `[REQ]`** — no son secretos, no se generan al azar;
     se copian de `config/deployment.config.json` (ya resuelto por
     `disaster-configure`) o del entorno real del deployer:
     - `WEB_DOMAIN` ← `domains.web`, `API_DOMAIN` ← `domains.api`,
       `ADMIN_DOMAIN` ← `domains.admin`
     - `NEXT_PUBLIC_API_URL` ← `https://` + `domains.api`
     - `CORS_ORIGINS` ← `https://` + `domains.web` (y `https://www.` + lo
       mismo si vas a servir `www`)
     - `APP_BASE_URL` ← `https://` + `domains.admin` (el backend arma links
       de invitación hacia el PANEL admin, no hacia el sitio público)
     - `ADMIN_BASE_URL` ← `https://` + `domains.admin`
     - `ACME_EMAIL`, `SEED_ADMIN_EMAIL` ← `contactEmail`
     - `COOKIE_SECURE=true` (fijo, obligatorio en producción — HTTPS
       detrás de Caddy)
     - `NODE_ENV=production`
   - **`[OPT]` de integraciones de terceros** (`SMTP_*`, `RESPONSEGRID_*`,
     `MINIMAX_*`, `OPENPANEL_*`, `HUB_ADMIN_DATABASE_URL`, `R2_*`) — no se
     generan, quedan vacíos/`false` salvo que el deployer explícitamente
     quiera activar esa integración y te dé sus credenciales reales. No
     inventes valores para estas.
   - **`TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` —
     tratamiento aparte, NO como un `[OPT]` más.** Son el único anti-bot en
     casi toda la superficie de escritura pública (reportes, desaparecidos,
     contacto, donaciones, chat, hospitales, importación de pacientes) y
     fallan ABIERTO en silencio si faltan (sin aviso en el arranque). Cuenta
     gratis en unos minutos:
     https://dash.cloudflare.com/?to=/:account/turnstile. Pide ambas claves
     al deployer ANTES de declarar terminado este skill para un despliegue
     de producción — ver "Hard stop" abajo.
2. Construye `DATABASE_URL` a partir del `POSTGRES_PASSWORD` generado:
   `postgres://app_user:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>` (host
   `db`, puerto `5432` — nombre del servicio en `docker-compose.prod.yml`,
   no `localhost`).
3. Escribe todo el resultado a `.env` (local) o `.prod.env` (el nombre que
   usa `docker-compose.prod.yml --env-file .prod.env`, ver cabecera de ese
   archivo) preservando la estructura por secciones de `.env.example` para
   que sea diffable a mano si hace falta.
4. **Opcional — GitHub Environment secrets**: si el deployer quiere que el
   despliegue se dispare desde CI/CD en vez de copiar el `.env` a mano al
   VPS, sube cada secreto (no las variables de identidad/dominio, esas
   pueden ir como GitHub Environment *variables* normales) con:
   ```bash
   gh secret set JWT_SECRET --env production --body "$JWT_SECRET"
   gh secret set IP_SALT --env production --body "$IP_SALT"
   # ...repite por cada secreto generado
   ```
   Requiere que el deployer ya haya corrido `gh auth login` y que el
   `Environment` `production` exista en su repo (créalo con
   `gh api repos/:owner/:repo/environments/production -X PUT` si no existe).
   Salta este paso si el deployer no lo pide — no es obligatorio para
   desplegar (ver `disaster-deploy-vps`, que copia `.env` directo al VPS).

## Pasos

1. Confirma que `config/deployment.config.json` tiene dominios/contacto
   reales (no `example.org`) — si no, detente y manda al deployer a
   `disaster-configure`.
2. Genera cada secreto de la lista de arriba con el comando `openssl rand`
   indicado. Ejemplo:
   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   IP_SALT=$(openssl rand -hex 16)
   PATIENT_DOCUMENT_HASH_SECRET=$(openssl rand -hex 32)
   SEED_ADMIN_PASSWORD=$(openssl rand -base64 24)
   POSTGRES_PASSWORD=$(openssl rand -base64 24)
   VALKEY_PASSWORD=$(openssl rand -base64 24)
   ADMIN_PASSWORD=$(openssl rand -base64 12)
   CRON_SECRET=$(openssl rand -hex 24)
   METRICS_TOKEN=$(openssl rand -hex 24)
   ```
3. Escribe `.env` (o `.prod.env`) combinando estos secretos con los valores
   de identidad/dominio del paso "Qué hace" punto 3, y con todo lo demás de
   `.env.example` que no sea `[REQ]` dejado en su default (`[OPT]` sin
   configurar = comportamiento degradado documentado en el propio
   `.env.example`, no un error).
4. Camino VPS: si el deployer pidió GitHub Environment secrets, súbelos con
   `gh secret set` como en el punto 4 de "Qué hace". Camino Cloudflare:
   escribe cada secreto con `doppler secrets set` en AMBAS configs
   (`prd`/`stg`, con valores generados por separado) como en "Dos vías de
   entrega" arriba, y crea los dos tokens de servicio
   (`DOPPLER_TOKEN`/`DOPPLER_TOKEN_STAGING`) como secrets de GitHub.
5. Verifica (ver abajo) y solo entonces informa al deployer que puede
   continuar con `disaster-deploy-cloudflare` (camino Doppler) o
   `disaster-deploy-vps` (camino `.env`).

## Verificación (obligatoria)

1. **Ningún placeholder sobrevive.** Grep de guardia sobre el archivo
   generado — debe devolver vacío:
   ```bash
   grep -in "change_me\|example.org\|example_" .env 2>/dev/null || grep -in "change_me\|example.org\|example_" .prod.env
   ```
2. **Todo `[REQ]` de `.env.example` tiene un valor no vacío** en el archivo
   generado:
   ```bash
   grep -B1 '^[A-Z_]*=' .env.example | grep -A1 '\[REQ\]' | grep -oE '^[A-Z_]+' | while read var; do
     grep -q "^${var}=" .env 2>/dev/null && [ -n "$(grep "^${var}=" .env | cut -d= -f2-)" ] || echo "FALTA o vacío: $var"
   done
   ```
   (ajusta el nombre del archivo si generaste `.prod.env` en vez de `.env`).
3. `COOKIE_SECURE=true` y `NODE_ENV=production` están presentes para el
   perfil de producción.
4. `.env`/`.prod.env` NO aparece en `git status --porcelain` como archivo
   trackeado (debe seguir ignorado):
   ```bash
   git check-ignore -v .env 2>/dev/null || git check-ignore -v .prod.env
   ```
5. **Camino Doppler únicamente** — todo `[REQ]` tiene valor no vacío en
   AMBAS configs, y ninguno quedó con un placeholder:
   ```bash
   doppler secrets download --project <tu-proyecto-doppler> --config prd --no-file --format env \
     | grep -i "change_me\|example.org\|example_" && echo "quedan placeholders en prd" || echo "prd limpio"
   doppler secrets download --project <tu-proyecto-doppler> --config stg --no-file --format env \
     | grep -i "change_me\|example.org\|example_" && echo "quedan placeholders en stg" || echo "stg limpio"
   ```
   (el primer `grep` con hallazgos imprime las líneas Y el mensaje de "quedan
   placeholders" porque `&&` sigue al `grep`; si no hay hallazgos, `grep`
   sale con código 1 y cae al mensaje de "limpio" del `||`.)
6. **Camino Doppler únicamente** — `DOPPLER_TOKEN`/`DOPPLER_TOKEN_STAGING`
   existen como secrets de GitHub, y ningún secreto individual
   (`JWT_SECRET`, credenciales de R2, tokens de Cloudflare...) aparece
   también ahí — solo esos dos nombres:
   ```bash
   gh secret list
   ```

## Hard stop

**No declares esto terminado** — ni le digas al deployer que puede avanzar a
`disaster-deploy-cloudflare`/`disaster-deploy-vps` — mientras:
- El re-run guard de arriba no se resolvió: el despliegue parece ya estar en
  vivo (identidad real + secretos ya escritos) y no tienes una confirmación
  explícita y por escrito del deployer para regenerarlos.
- Cualquier variable `[REQ]` de `.env.example` quede sin valor, o con
  `CHANGE_ME*`/`example.org`/`example_` literal en el destino generado
  (`.env`/`.prod.env` o cualquiera de las dos configs de Doppler).
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `IP_SALT`,
  `PATIENT_DOCUMENT_HASH_SECRET`, `SEED_ADMIN_PASSWORD` o `VALKEY_PASSWORD`
  tengan menos de 16 caracteres reales de entropía (un `openssl rand` con los
  tamaños indicados arriba ya lo garantiza — si generaste a mano, revísalo).
- El archivo generado terminó commiteado o trackeado por git, o algún
  secreto individual (no `DOPPLER_TOKEN`/`DOPPLER_TOKEN_STAGING`) terminó
  como secret de GitHub en el camino Doppler.
- Un secreto quedó guardado bajo un nombre distinto del que el código
  realmente lee (ver "Disciplina de nombres exactos" arriba) — verificado,
  no asumido.
- **`TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY` están vacías Y el
  deployer no dio una autorización explícita por escrito para ir a
  producción sin anti-bot.** No lo asumas ni lo decidas tú: si el deployer
  no te dio las claves, pregúntale directamente ("¿confirmas que quieres
  desplegar SIN Turnstile, con las rutas de escritura pública sin
  protección anti-bot?") y solo continúa si responde que sí, por escrito, en
  la conversación. Esa respuesta es el registro de la decisión — no dejes
  pasar el punto en silencio ni lo apruebes en su nombre.

## Siguiente paso

Con los secretos completos y verificados, continúa con
`disaster-deploy-cloudflare` (si escribiste a Doppler) o `disaster-deploy-vps`
(si escribiste `.env`/`.prod.env`).
