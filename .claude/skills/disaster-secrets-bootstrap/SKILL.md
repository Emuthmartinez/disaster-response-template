---
name: disaster-secrets-bootstrap
description: Lee .env.example, genera valores aleatorios fuertes (openssl rand) para cada variable [REQ] que es un secreto, y escribe .env (nunca se commitea). Opcionalmente sube los secretos como GitHub Environment secrets con gh. Rehúsa declararse terminado mientras quede CHANGE_ME o un valor de example.org en una variable [REQ].
---

# disaster-secrets-bootstrap

Tercer paso del standup (después de `disaster-configure` y `disaster-brand`,
antes de `disaster-deploy-vps`). Convierte el contrato documentado en
`.env.example` en un `.env` (o `.prod.env`) real, con secretos generados y
los valores de identidad/dominio ya resueltos por `disaster-configure`.

## Antes de empezar

- `.env` y `.env.*` (excepto `.env.example`) ya están en `.gitignore` — nunca
  los agregues a git tú mismo, y nunca imprimas su contenido completo en un
  mensaje que pueda quedar en un log público.
- Este skill asume que `config/deployment.config.json` ya tiene los dominios
  reales (`domains.web/api/admin`) y el `contactEmail` real — si no, corre
  `disaster-configure` primero.

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
4. Si el deployer pidió GitHub Environment secrets, súbelos con `gh secret
   set` como en el punto 4 de arriba.
5. Verifica (ver abajo) y solo entonces informa al deployer que puede
   continuar con `disaster-deploy-vps`.

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

## Hard stop

**No declares esto terminado** — ni le digas al deployer que puede avanzar a
`disaster-deploy-vps` — mientras:
- Cualquier variable `[REQ]` de `.env.example` quede sin valor, o con
  `CHANGE_ME*`/`example.org`/`example_` literal en el archivo generado.
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `IP_SALT`,
  `PATIENT_DOCUMENT_HASH_SECRET`, `SEED_ADMIN_PASSWORD` o `VALKEY_PASSWORD`
  tengan menos de 16 caracteres reales de entropía (un `openssl rand` con los
  tamaños indicados arriba ya lo garantiza — si generaste a mano, revísalo).
- El archivo generado terminó commiteado o trackeado por git.
- **`TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY` están vacías Y el
  deployer no dio una autorización explícita por escrito para ir a
  producción sin anti-bot.** No lo asumas ni lo decidas tú: si el deployer
  no te dio las claves, pregúntale directamente ("¿confirmas que quieres
  desplegar SIN Turnstile, con las rutas de escritura pública sin
  protección anti-bot?") y solo continúa si responde que sí, por escrito, en
  la conversación. Esa respuesta es el registro de la decisión — no dejes
  pasar el punto en silencio ni lo apruebes en su nombre.

## Siguiente paso

Con `.env`/`.prod.env` completo y verificado, continúa con
`disaster-deploy-vps`.
