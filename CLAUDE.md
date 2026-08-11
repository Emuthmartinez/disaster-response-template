# CLAUDE.md — entrypoint para agentes

Esta es una **plantilla pública** para levantar un sitio de respuesta a
desastres: mapa/lista de reportes ciudadanos, directorio de
hospitales/refugios, centros de acopio, panel admin con RBAC y jobs de fondo
para sincronización. Frontend Next.js, backend Express/Drizzle/Postgres,
admin Next.js standalone. No asume ningún país, evento ni organización — toda
esa identidad vive en `config/deployment.config.json` y en tus secretos
(Doppler o `.env`, según el camino que elijas abajo).

Para las convenciones de código (endpoints, DDD de integraciones, Drizzle,
reglas ESLint) lee **`AGENTS.md`**. Este archivo cubre el *standup* de un
despliegue nuevo — qué skill correr, en qué orden — y el conocimiento
operativo que un agente necesita para no romper un despliegue que ya sirve
tráfico real.

## Dos caminos de despliegue

| | **Camino A — Cloudflare** (recomendado) | **Camino B — VPS** (alternativo) |
| --- | --- | --- |
| Runtime | Workers (frontend + API + admin) vía `@opennextjs/cloudflare` / `httpServerHandler` | Node en `docker-compose.prod.yml`, un solo VPS |
| Base de datos | Neon Postgres (driver HTTP, serverless) | Postgres propio (contenedor `db`) |
| Secretos | Doppler (`prd`/`stg`) | `.env`/`.prod.env` en el VPS |
| Colas de fondo | Cloudflare Queues + Cron Triggers | BullMQ + Valkey (contenedor `worker`) |
| Transacciones interactivas de Postgres | **No funcionan** (driver HTTP de Neon) | Funcionan (node-postgres) |
| Email | Resend (o cualquier SMTP) | SMTP que configures |
| Costo típico | Capa gratis de Cloudflare + Neon; escala sin tocar infra | Un VPS fijo, tú administras el SO |
| Skill de deploy | `disaster-deploy-cloudflare` | `disaster-deploy-vps` |

**Camino A (Cloudflare Workers + Neon + Doppler + Resend) es el camino
primario** para un despliegue nuevo: no hay servidor que mantener, escala
sola, y es el que documenta con más detalle
[`docs/runbook-cloudflare-launch.md`](docs/runbook-cloudflare-launch.md).
**Camino B (VPS + `docker-compose.prod.yml`) sigue siendo una alternativa
completa** — de hecho es el **único** camino donde corren a la vez colas
BullMQ, transacciones interactivas de Postgres y el panel `admin/` sin
adaptación — documentado en
[`docs/deploy-vps.md`](docs/deploy-vps.md). Elige B si necesitas esas tres
cosas simultáneamente desde el día uno, si prefieres no depender de
Cloudflare/Neon, o si ya tienes infraestructura VPS operando.

No mezcles caminos a medio camino de un standup: la elección afecta qué
secretos generas, cómo se guardan y cómo se verifica el deploy.

## Orden de standup (obligatorio, en este orden)

Los primeros tres pasos son iguales en ambos caminos. El cuarto se bifurca
según el camino elegido. El quinto es común y obligatorio. Cada skill tiene
su propio `SKILL.md` con pasos, verificación y hard-stops — este archivo solo
da el mapa.

1. **`disaster-configure`** — rellena `config/deployment.config.json` (org,
   producto, desastre, región, centro del mapa, idioma, contacto, dominios) y
   propaga esos valores a `manifest.webmanifest`, `event-data.ts` y
   `emergency-contacts.ts` (números reales de emergencia — te los da el
   deployer, no se inventan).
2. **`disaster-brand`** — aplica colores/logo reales a `docs/DESIGN.md`, las
   variables CSS, el manifest, los SVG de icon/hero y las imágenes OG.
   Rehúsa correr si el paso 1 no terminó.
3. **`disaster-secrets-bootstrap`** — genera secretos fuertes
   (`openssl rand`) para cada variable `[REQ]` de `.env.example`. El
   **destino** depende del camino: Camino B los escribe a `.env`/`.prod.env`
   (nunca se commitea); Camino A los sube a Doppler (`doppler secrets set`,
   proyectos `prd`/`stg`) con los mismos NOMBRES de variable — `.env.example`
   es el contrato único, independiente de dónde vivan los valores.
4. **El deploy en sí — bifurca según el camino:**
   - **Camino A: `disaster-deploy-cloudflare`** — crea el proyecto Neon,
     enlaza Doppler (`doppler login --scope`), aplica el módulo OpenTofu de
     `infra/cloudflare/` (DNS anti-suplantación, CAA, DNSSEC, zona), crea el
     bucket R2 y el widget Turnstile, rellena los `CHANGE_ME` de cada
     `wrangler.jsonc` (frontend/backend/admin), crea las Cloudflare Queues
     declaradas ahí, configura Resend, y despliega los tres Workers vía los
     workflows de `.github/workflows/deploy-*.yml`. Ver
     [`docs/runbook-cloudflare-launch.md`](docs/runbook-cloudflare-launch.md)
     para el runbook operativo completo, fase por fase.
   - **Camino B: `disaster-deploy-vps`** — provisión de un VPS Ubuntu limpio,
     hardening, Docker, clona el fork del deployer, `docker compose -f
     docker-compose.prod.yml up -d`, TLS con Caddy sobre los dominios reales
     (con el paso de DNS), y smoke checks.
   - Ambos requieren que 1–3 ya hayan corrido.
5. **`disaster-content-audit`** — gate bloqueante **antes de cualquier fork
   o push público**, sin importar el camino elegido: corre
   `scripts/content-audit/run.sh`, revisión humana del diff/árbol, historial
   de git limpio, sin EXIF/GPS en binarios. Se vuelve a correr cada vez que
   el repo esté a punto de hacerse público — incluido cada fork de un
   deployer sobre su propia copia.

Guía humana equivalente, con quickstart de 30 minutos para ambos caminos:
`docs/standup-guide.md`.

## Reglas de seguridad (sin excepción)

- **Nunca commitees `.env`** ni ningún `.env.*` real (`.gitignore` ya los
  cubre; `.env.example` es el único que sí se commitea, y solo con
  placeholders obviamente falsos como `CHANGE_ME_...`/`example.org`). En el
  Camino A el equivalente es: nunca pegues un secreto de Doppler en un chat,
  un commit, un log o un issue.
- **Nunca commitees datos reales de una crisis.** Ni en código, ni en
  fixtures, ni en tests, ni en docs, ni en un issue o PR. Nombres de
  personas, cédulas, teléfonos, direcciones privadas, notas médicas o fotos
  reales de afectados no van a este repo bajo ninguna circunstancia — este
  no es el canal para eso. Ver `AGENTS.md` sección "Seguridad y privacidad"
  para la lista completa de qué nunca se hardcodea.
- **Política de no-datos-reales en seeds/fixtures.** `backend/src/seed/`
  genera datos SINTÉTICOS con prefijo `DEMO-`, aborta si `NODE_ENV=production`
  o si `DATABASE_URL` no apunta a un host local, y aborta si ya hay filas
  no-demo en la tabla (anti-mezcla). Cualquier fixture o test nuevo sigue el
  mismo patrón: sintético, marcado como demo, nunca un dato real "de
  ejemplo" copiado de un caso real.
- **No inventes ni asumas identidad real.** Cualquier dominio, email,
  teléfono, nombre de organización/evento o coordenada sensible que aparezca
  en código fuera de `config/deployment.config.json`/tus secretos es un
  bug — repórtalo o corrígelo, no lo repliques. Una vez que un fork está
  desplegado de verdad, sus propios `wrangler.jsonc` y workflows de deploy sí
  llevan la identidad real a propósito: ver AGENTS.md → "No hardcodees
  identidad real" para la lista exacta de esa excepción.
- **El historial de git debe quedarse vacío** hasta que
  `disaster-content-audit` dé su verdicto y un humano revise el árbol. No
  hagas `git commit`/`git push` en este template por iniciativa propia
  mientras trabajas en él — eso es una decisión del mantenedor humano, no de
  un agente.

## Conocimiento operativo

Lecciones de despliegues reales sobre esta plantilla, en forma genérica.
Aplican sobre todo al Camino A (Cloudflare); se marca cuando algo es
específico de un camino.

- **Empujar a `main` puede desplegar solo.** El patrón que trae esta
  plantilla para el Camino A: el frontend se despliega automático en cada
  push a `main` que toque `frontend/**` o `config/deployment.config.json`
  (`deploy-frontend.yml`); el backend y el admin son **manuales**, con un
  `workflow_dispatch` que exige escribir una palabra de confirmación
  (`deploy-backend.yml`, `deploy-admin.yml`). La razón: el frontend es
  stateless y barato de revertir; el backend comparte base de datos con lo
  que ya está sirviendo. Trata "empujar a main" como "puede estar
  desplegando a un sitio que alguien está usando ahora" — verifica qué
  workflows se disparan antes de asumir que un push es inocuo.
- **`wrangler.jsonc` nunca debe declarar `routes`.** Los dominios propios se
  adjuntan por la API de **cuenta**. Si declaras `routes`, wrangler llama
  además a `/zones/{id}/workers/routes`, para lo que un token *account-scoped*
  no tiene permiso — y ese fallo aborta el deploy **después** de subir el
  código y **antes** de promover la versión: el Worker se queda sirviendo la
  build anterior en silencio, y el comando de deploy puede verse casi
  correcto. Usa dominios personalizados vía la API de cuenta, nunca `routes`.
- **Doppler no sincroniza solo con los Workers.** Guardar un secreto en
  Doppler no lo mueve a Cloudflare — necesitas un paso explícito
  (`wrangler secret bulk` / `wrangler secret put`) cada vez que cambies un
  secreto, en cada entorno. Y después de subirlo, cuenta **30–60 segundos**
  de propagación a los isolates ya calientes antes de que un script de
  verificación deba confiar en un resultado "inactivo" como error real.
- **Turnstile tiene un orden estricto: site key primero, secret después.**
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` se hornea en el build del frontend; si
  activas `TURNSTILE_SECRET_KEY` en el backend antes de confirmar que la
  site key ya llegó al bundle desplegado, **todas** las escrituras públicas
  empiezan a fallar con 403, sin ningún error visible en logs — solo en el
  comportamiento real de un usuario. Invertir el orden es exactamente el
  incidente que ya le pasó a más de un despliegue real de esta plantilla.
- **Bot Fight Mode choca con la CSP del frontend.** El script que inyecta
  Bot Fight Mode en la zona de Cloudflare no es compatible con una CSP
  estricta de Next.js. Si lo activas, o ajustas la CSP para permitirlo, o lo
  dejas apagado — no lo actives "porque suena a más seguridad" sin revisar
  la consola del navegador después.
- **La cache de zona puede esconder un deploy exitoso — o uno fallido.**
  Un `curl` inmediato después de un deploy puede devolver la build anterior
  por cache de borde, y verse indistinguible de un deploy que falló. Receta
  de verificación: compara el hash del bundle servido (p.ej. el nombre del
  chunk `turbopack-*.js` o un build id embebido) contra el que acabas de
  construir, o pasa por alto la cache con un query param/`Cache-Control`
  antes de confiar en cualquier diagnóstico de "no se desplegó".
- **Lo que se enfría es Neon, no el Worker.** Un `readyz` lento tras un rato
  de inactividad casi siempre es el cold-start de scale-to-zero de Neon (uno
  o varios segundos en la primera consulta), no el isolate de Cloudflare.
  Para distinguirlos: compara un endpoint sin I/O (`healthz`) contra uno con
  una consulta real (`readyz`) — si solo el segundo es lento, es Neon.
  Mantener Neon caliente (autosuspend más alto, un ping periódico) es una
  decisión de costo, no técnica — déjasela al mantenedor.
- **Sin transacciones interactivas en Workers/Neon HTTP.** El driver que usa
  Neon desde un Worker es HTTP, no una conexión TCP con estado — un
  `db.transaction(async (tx) => …)` compila, pasa los tests locales
  (node-postgres sí las soporta) y **falla en producción** sin que ningún
  test lo vea venir. Ver `AGENTS.md` → "PROHIBIDO `db.transaction`" para los
  patrones de reemplazo. Esto no aplica al Camino B (VPS/node-postgres).
- **Las colas deben existir antes del primer deploy que las declara.**
  Declarar una cola en `wrangler.jsonc` no la crea — `wrangler queues create
  <nombre>` tiene que correr primero, para producción **y** para staging por
  separado, o el primer deploy que referencia esa cola falla con un error de
  API poco claro.
- **Principio de paridad de staging — y una excepción dura.** Un staging que
  no se parece a producción no prueba nada: mismo `wrangler.jsonc` (bloque
  `env.staging`), mismos flags, mismas integraciones. **Pero nunca bifurques
  la base de datos de staging directamente desde la de producción** si
  producción ya tiene PII real — eso duplica al instante la exposición de
  datos sensibles de personas en crisis hacia un segundo dominio,
  típicamente con menos protecciones (sin Turnstile, sin Access). Genera
  staging con datos sintéticos `DEMO-`, no con una copia de producción.
- **Aviso de domain-squatting.** Registra o al menos revisa TLDs parecidos
  al dominio real (`.com`/`.org`/`.app` si tu dominio real es `.co`, y
  viceversa) el mismo día que registras el tuyo. Es un patrón conocido de
  phishing en sitios de desastre: alguien puede registrar una variante en
  minutos y montar una copia falsa del formulario de reportes.
- **Regla de worktree para agentes concurrentes.** Un despliegue real suele
  tener varias sesiones de agente trabajando a la vez sobre el mismo repo.
  Cada sesión debe vivir en su **propio `git worktree`**, nunca compartir el
  checkout principal — un `checkout`/`pull`/`stash` ajeno en un checkout
  compartido puede tirar el trabajo de otra sesión sin ningún error visible.
  Antes de mergear una rama compartida (`staging` → `main`), revisa
  explícitamente **qué otros cambios viajan con el merge** — un merge
  ingenuo puede llevar a producción una feature de otra sesión que todavía
  no estaba lista.

## Dónde mirar

```text
config/deployment.config.json   Identidad del despliegue (fuente de verdad)
.env.example                     Contrato completo de variables de entorno
.claude/skills/disaster-*/       Los skills de standup (dos caminos de deploy)
docs/standup-guide.md            Guía humana + quickstart, ambos caminos
docs/runbook-cloudflare-launch.md Runbook operativo del Camino A (Cloudflare)
docs/doppler.md                  Doppler: login con scope, proyectos, tokens
docs/cloudflare-tokens.md        Los dos tokens de Cloudflare y sus permisos
docs/runbook-admin.md            Onboarding y operación del panel admin
docs/deploy-vps.md               Runbook del Camino B (VPS, alternativo)
docs/architecture.md             Estado actual del sistema (ambas topologías)
docs/DESIGN.md                   Sistema de diseño / tokens de marca
AGENTS.md                        Convenciones de código para agentes/humanos
CONTRIBUTING.md                  Flujo de contribución, fork-first
```

Si algo en este archivo entra en conflicto con `AGENTS.md` para una tarea de
código (no de standup), gana `AGENTS.md` — este archivo es específicamente
la puerta de entrada al proceso de desplegar un fork nuevo y el conocimiento
operativo para no romper uno que ya está en producción.
