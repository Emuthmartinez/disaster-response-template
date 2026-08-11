# Guía de standup

Cómo pasar de "hice fork de este template" a "tengo un sitio de respuesta a
desastres real corriendo en mi propio dominio", paso a paso. Si estás usando
un agente de código (Claude Code u otro compatible con `.claude/skills/`),
puedes pedirle directamente que corra cada skill mencionado abajo — cada uno
tiene su propio `SKILL.md` con el detalle técnico completo. Esta guía es la
versión para humanos, con el porqué y el orden.

Hay **dos caminos de despliegue** (ver `CLAUDE.md` → "Dos caminos de
despliegue" para la tabla comparativa completa). Los primeros tres pasos son
idénticos en ambos; el paso 4 se bifurca. Elige tu camino antes de empezar —
afecta dónde guardas tus secretos y cómo verificas el resultado.

- **Camino A — Cloudflare Workers + Neon + Doppler** (recomendado): sin
  servidor que mantener, escala sola. Quickstart abajo.
- **Camino B — VPS + Docker Compose** (alternativo): el único camino donde
  corren a la vez colas BullMQ, transacciones interactivas de Postgres y el
  panel `admin/` sin adaptación. Quickstart abajo.

## Quickstart — Camino A (Cloudflare), ~45 minutos + propagación

Necesitas de antemano: nombre de tu organización, nombre del evento/desastre,
centro del mapa (lat/lng) y zoom, un email de contacto, un dominio con
acceso a su DNS (lo vas a delegar a Cloudflare si no lo está ya), dos tokens
de API de Cloudflare (`docs/cloudflare-tokens.md`), una cuenta de Doppler, y
una cuenta de Neon.

1. **Configura la identidad** (~5 min): `disaster-configure` (ver paso 1 de
   la sección larga abajo).
2. **Aplica tu marca** (~5 min): `disaster-brand` (paso 2 abajo).
3. **Genera secretos, guárdalos en Doppler** (~5 min): `disaster-secrets-bootstrap`
   genera valores fuertes; en el Camino A el destino es Doppler
   (`doppler secrets set`), no un archivo `.env` — ver `docs/doppler.md`.
4. **Despliega** (~25 min, incluye propagación DNS/DNSSEC/TLS):
   `disaster-deploy-cloudflare` — aplica el módulo OpenTofu de la zona,
   provisiona Neon, rellena los `wrangler.jsonc` de frontend/backend/admin,
   despliega los tres Workers, crea el bucket R2 y el widget Turnstile.
   Runbook operativo completo, fase por fase:
   [`docs/runbook-cloudflare-launch.md`](runbook-cloudflare-launch.md).
5. **Audita antes de publicar** (~3 min de escaneo + revisión humana
   obligatoria): `disaster-content-audit`, igual que el Camino B — ver el
   paso 5 de la sección larga.

## Quickstart — Camino B (VPS), 30 minutos si ya tienes todo a mano

Necesitas de antemano: nombre de tu organización, nombre del evento/desastre,
centro del mapa (lat/lng) y zoom, un email de contacto, tres dominios/subdominios
(sitio, api, admin) con acceso a su DNS, los números reales de emergencia de
tu región, y un VPS Ubuntu recién provisto con acceso SSH.

1. **Configura la identidad** (~5 min): edita
   `config/deployment.config.json` con tus datos. Pide a tu agente que corra
   el skill `disaster-configure`, o sigue el paso 1 de la sección larga
   abajo a mano.
2. **Aplica tu marca** (~5 min): colores y logo, vía `disaster-brand` (paso
   2 abajo).
3. **Genera secretos** (~2 min): `disaster-secrets-bootstrap` genera
   contraseñas/claves fuertes y arma tu `.env` de producción.
4. **Despliega al VPS** (~15 min, incluye propagación DNS): `disaster-deploy-vps`
   provisiona el servidor, levanta Docker Compose + Caddy con TLS y corre
   smoke checks.
5. **Audita antes de publicar** (~3 min de escaneo + revisión humana
   obligatoria, sin límite de tiempo fijo): `disaster-content-audit` **antes**
   de hacer público tu fork o compartir el link del repo con nadie fuera de
   tu equipo de confianza.

Si te falta algo de cualquiera de las dos listas de arriba (sobre todo los
números de emergencia reales o el acceso DNS), resuélvelo antes de empezar —
varios pasos dependen de tenerlo.

## Guía paso a paso

### 0. Antes de tocar nada

Haz fork de este repo a tu propia cuenta/organización de GitHub, **en
privado** — no lo publiques todavía. Todo lo que sigue pasa en ese fork
privado; solo al final, después de `disaster-content-audit`, decides
hacerlo público.

### 1. `disaster-configure` — identidad del despliegue

Rellena `config/deployment.config.json`: nombre de tu organización, nombre
del producto/sitio, nombre del desastre/evento, tipo de desastre, etiqueta de
región, centro del mapa y zoom inicial, idioma, email de contacto, y los tres
dominios. Este archivo es la fuente de verdad que lee el resto del sitio en
tiempo de ejecución, en ambos caminos de despliegue.

Además, a mano (el loader de config no puede alcanzarlos):
- `frontend/public/manifest.webmanifest` — nombre/descripción de la PWA.
- `frontend/lib/event-data.ts` — metadata del evento real y las localidades
  en riesgo (reemplaza los datos de ejemplo).
- `frontend/lib/emergency-contacts.ts` — **los números reales de emergencia
  de tu región** (bomberos, ambulancias, protección civil). Esto es lo único
  que ningún skill puede adivinar por ti — tenlos a mano antes de empezar.

Verifica: `cd frontend && npm run build` pasa, y el mapa (revisa
`config/deployment.config.json` → `mapCenter`) apunta a tu región.

### 2. `disaster-brand` — tu marca visual

Con la identidad ya puesta, aplica tu paleta de colores y logo:
`docs/DESIGN.md` (tokens), `frontend/app/globals.css` (variables CSS),
`manifest.webmanifest` (theme_color), los SVG de icono/hero, y las imágenes
de vista previa social (Open Graph/Twitter). Si no tienes un logo propio, el
motivo de "pin de mapa" por defecto se queda, solo con tus colores.

Este skill se niega a correr si el paso 1 no terminó (detecta valores de
`example.org` restantes) — así evitas rebrandear un sitio que todavía dice
"Organización Ejemplo".

### 3. `disaster-secrets-bootstrap` — secretos de producción

Genera cada secreto requerido (`JWT_SECRET`, `IP_SALT`,
`PATIENT_DOCUMENT_HASH_SECRET`, contraseñas de Postgres/Valkey/superadmin,
etc.) con `openssl rand`. El **destino** depende de tu camino:

- **Camino B**: arma tu `.env`/`.prod.env` real combinando esos secretos con
  los dominios/contacto que ya pusiste en el paso 1. `.env` **nunca se
  commitea** — el `.gitignore` de este repo ya lo excluye.
- **Camino A**: sube cada valor a Doppler (`doppler secrets set`, proyectos
  `prd`/`stg`) con los mismos NOMBRES que documenta `.env.example` — ver
  `docs/doppler.md`.

Este skill no termina — ni te dice que sigas al paso 4 — mientras quede
algún `CHANGE_ME` o valor de ejemplo en una variable requerida.

### 4. El deploy — bifurca según tu camino

#### Camino A: `disaster-deploy-cloudflare`

Runbook operativo completo, fase por fase (anti-suplantación DNS antes de
que exista nada más, infra, Neon, secretos, deploy, staging, R2, colas,
Turnstile, Access opcional, SMTP, verificación):
[`docs/runbook-cloudflare-launch.md`](runbook-cloudflare-launch.md). Los dos
tokens de Cloudflare que necesitas y sus permisos exactos:
[`docs/cloudflare-tokens.md`](cloudflare-tokens.md).

#### Camino B: `disaster-deploy-vps`

Con un VPS Ubuntu limpio y acceso SSH:
1. Usuario de deploy + hardening SSH (sin root, sin password) + firewall
   (UFW: solo 22/80/443) + fail2ban.
2. Instala Docker.
3. Clona tu fork, copia tu `.env`/`.prod.env` al servidor por un canal
   seguro (nunca por git).
4. Crea los registros DNS A de tus tres dominios apuntando a la IP del VPS y
   espera a que propaguen.
5. `docker compose -f docker-compose.prod.yml --env-file .prod.env up -d
   --build` — levanta Postgres, Valkey, migraciones, backend, worker,
   frontend, admin y Caddy (que emite TLS automático vía Let's Encrypt).
6. Smoke checks: todos los servicios `healthy`/`running`, los tres dominios
   responden por HTTPS, el mapa carga centrado en tu región, un reporte de
   prueba (con datos ficticios) se envía y aparece, el panel admin
   autentica con tu superadmin.

Runbook detallado: [`docs/deploy-vps.md`](deploy-vps.md).

### 5. `disaster-content-audit` — antes de publicar, siempre

**Este paso es un gate, no un formalismo, sin importar el camino elegido.**
Antes de que tu fork se haga público, o de compartir el link con alguien
fuera de tu equipo:

1. Corre `scripts/content-audit/run.sh`.
2. Revisa cada hit a mano — un escaneo automatizado no distingue un
   placeholder documentado de un dato real.
3. Confirma que el historial de git de tu fork no arrastra commits/objetos
   de un repo anterior con datos reales.
4. Confirma que ningún binario (fotos, capturas) lleva metadata EXIF/GPS.

El veredicto de este paso **nunca** es "está limpio" o "es seguro publicar"
— es, como máximo, *"sin hallazgos de patrón conocido; no se puede confirmar
que esté limpio"*. Un escaneo automatizado busca patrones conocidos; no
puede probar la ausencia de algo que no calce con esos patrones. Por eso el
paso final siempre es: **un humano de tu equipo revisa el diff o el árbol
completo antes del push a público**, sin excepción, cada vez que el repo
esté a punto de cambiar de visibilidad — no solo la primera vez.

## Origen

Esta plantilla nació de la respuesta ciudadana al terremoto de Venezuela de
2026 — generalizada para que cualquier comunidad pueda levantar su propia
instancia ante el próximo desastre, sin arrastrar la identidad ni los datos
del despliegue original.
