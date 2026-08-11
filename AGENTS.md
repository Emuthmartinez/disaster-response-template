# AGENTS.md

Guía operativa para agentes de código (y humanos) que trabajen en este
repositorio. Es una **plantilla** para sitios de respuesta a desastres:
mapa/lista de reportes, directorio de hospitales/refugios, centros de acopio,
panel de administración con RBAC y jobs de fondo para sincronización/backfills.
No asume ningún evento, país ni organización en particular — toda esa
identidad vive en `config/deployment.config.json` y en variables de entorno.

> **`CLAUDE.md` y `AGENTS.md` son dos ficheros distintos, a propósito. No los
> fusiones ni conviertas uno en symlink del otro.**
>
> Una versión anterior de este archivo pedía justo eso ("mantén CLAUDE.md
> como symlink a este archivo"). Seguir esa instrucción sería destructivo:
> `CLAUDE.md` cubre el *standup* de un despliegue nuevo (qué skill correr, en
> qué orden) y el conocimiento operativo para no romper uno que ya está en
> producción — contenido que este archivo no tiene y que un symlink borraría.
>
> Reparto: **`CLAUDE.md` manda en despliegue y seguridad operativa**; este
> fichero manda en **convenciones de código**. Si algo choca entre ambos para
> una tarea de código, gana este archivo; para una tarea de standup/deploy,
> gana `CLAUDE.md`.

## Antes de tocar código

- Lee este archivo, `CONTRIBUTING.md` y el código que vas a modificar antes de
  escribir nada.
- Si el cambio toca arquitectura, sincronización, datos, endpoints públicos,
  workers o despliegue, revisa también `docs/architecture.md` y actualízalo en
  el mismo cambio (ver "Regla de arquitectura" abajo).
- Si el cambio toca UI pública, estilos, layout, componentes visuales o copy
  de experiencia, revisa `docs/DESIGN.md` antes de editar y conserva sus
  tokens y criterios como fuente de verdad visual.
- Trabaja en una rama con nombre descriptivo. Haz cambios pequeños,
  revisables y con una razón clara: mantener el proyecto operativo vale más
  que una refactorización amplia.
- No reescribas historial, no borres ramas ajenas y no reviertas cambios que
  no hiciste.
- **Si este fork ya está desplegado** (Camino A o B — ver `CLAUDE.md`), un
  merge a la rama que dispara el deploy automático (normalmente `main`,
  tocando `frontend/**` o `config/deployment.config.json`) puede desplegar
  sin aprobación. Trata "empujar a esa rama" como "puede estar desplegando a
  un sitio que alguien está usando ahora". Detalles: `CLAUDE.md`.

## Regla de arquitectura

Si cambias la arquitectura real del sistema, no dejes la documentación atrás:

- Actualiza `docs/architecture.md` en el mismo cambio.
- Si cambia una regla que los agentes deben seguir, actualiza este archivo.
- Si agregas variables de entorno, actualiza `.env.example` (grupo correcto,
  marca `[REQ]`/`[OPT]`, valor placeholder obviamente falso).
- Si agregas o cambias un dominio/puerto/servicio, actualiza
  `docker-compose.yml`, `docker-compose.prod.yml` y `Caddyfile.example` a la
  vez que el código que lo necesita (Camino B).
- Y lo mismo para el Camino A: si el cambio toca bindings, vars,
  `compatibility_flags` o alias de bundling, actualiza el `wrangler.jsonc`
  correspondiente (`frontend/`, `backend/`, `admin/`); si toca el adaptador
  Next → Workers, actualiza `open-next.config.ts`; si toca smoke checks o
  filtros de ruta de un deploy automático, actualiza
  `.github/workflows/deploy-*.yml`; si toca DNS, WAF, cache o rate limit de
  la zona, actualiza el módulo OpenTofu en `infra/cloudflare/`. Un cambio que
  solo toca `docker-compose*.yml` no llega al Camino A, y viceversa un
  cambio que solo toca `wrangler.jsonc` no llega al Camino B — si el cambio
  aplica a ambos caminos, tócalos ambos en el mismo PR.

## Seguridad y privacidad (invariantes duros)

Este tipo de proyecto maneja datos de personas en crisis. GitHub es público y
**no** debe usarse como canal de emergencia ni como base de datos de personas
afectadas.

- **No hardcodees identidad real en código de plantilla.** Ningún dominio,
  IP, email, teléfono, nombre de organización/evento, coordenada sensible o
  handle de red social real va en `frontend/`, `backend/`, `admin/`,
  fixtures, tests o docs mientras este repo esté en su forma de plantilla
  genérica. Usa `example.org`, `admin@example.org`, variables de entorno, o
  valores leídos de `config/deployment.config.json`.

  **Excepción esperada una vez que un fork está desplegado de verdad — no la
  "arregles" en ese fork:** los ficheros de despliegue de un fork ya en
  producción **sí** llevan sus nombres reales a propósito, porque describen
  *esa* instalación concreta, no la plantilla:

  ```text
  config/deployment.config.json      identidad real de ese despliegue (dominios, org)
  frontend/wrangler.jsonc            nombre real de Worker + dominios propios
  backend/wrangler.jsonc             idem
  admin/wrangler.jsonc               idem
  .github/workflows/deploy-*.yml     nombres de Worker y URLs de smoke check
  .neon                              org y proyecto de Neon (sin secretos — ver docs/architecture.md)
  ```

  Sustituir esos valores por placeholders en un fork ya desplegado rompe el
  deploy. La regla protege el **código de la plantilla**, no la
  configuración de infraestructura de un despliegue real ya identificado.
- **No inventes ni cargues datos reales de personas.** Para ejemplos, tests y
  fixtures usa datos sintéticos, claramente marcados como demo. Nunca
  publiques en código, issues, PRs o capturas: teléfonos, correos personales,
  documentos de identidad, direcciones privadas completas, notas médicas,
  fotos privadas o hashes de fotos reales.
- **Toda ruta de API necesita rate-limit + validación.** Es un invariante
  duro, **enforced con ESLint** (`backend/eslint-rules/`, corre en
  `npm run lint` + CI):
  - `require-rate-limit`: toda ruta declara `rateLimit({ scope, limit })`, sin
    excepción por comentario.
  - `user-facing-mutation-needs-guard`: toda mutación (POST/PUT/PATCH/DELETE)
    en `src/routes/*` lleva `requireHuman` (Turnstile) o un gate
    (`requireAdmin` / `requireCapability` / `requireCron` /
    `requireSupplyWrite`). La excepción anónima legítima se documenta con
    `// eslint-disable-next-line local/user-facing-mutation-needs-guard -- razón`.
  - `no-turnstile-in-public-api`: `src/public-api/*` (superficie autenticada
    por capacidades) NO lleva Turnstile — no es tráfico de navegador.
  - `no-interactive-transactions`: ningún `<obj>.transaction(<fn>)` en
    `backend/src/**` (`backend/worker/**` está exento — ver "PROHIBIDO
    `db.transaction`" más abajo).
  - Toda validación de entrada pública se hace con Zod, en el servidor. No
    confíes en validaciones solo del cliente.
- **Nunca commitees secretos.** `.env`, `.prod.env`, dumps de base de datos,
  credenciales o tokens no van al repo (`.gitignore` ya los cubre). Si
  agregas un secreto nuevo, documenta su placeholder en `.env.example`, nunca
  su valor real.
- **No serialices objetos completos de entrada hacia respuestas públicas.**
  Expone solo los campos permitidos.
- Si encuentras una vulnerabilidad o una fuga de datos real, no abras un
  issue público — repórtalo por el canal privado de seguridad de tu fork u
  organización (p.ej. GitHub Security Advisories).

## Estado actual del stack

No hay `package.json` en la raíz. Es un monorepo simple con tres paquetes npm
y una capa de infraestructura compartida:

- `frontend/`: Next.js + React. UI/SSR pública; no accede directo a la base de
  datos ni reintroduce rutas `app/api/**` propias — todo HTTP pasa por
  `frontend/lib/api.ts`, `frontend/lib/server-api.ts` o hooks.
- `backend/`: Express + TypeScript. Sirve toda la superficie `/api`, valida
  entorno al arrancar (fail-fast en Node; ver la nota de Workers abajo), usa
  Drizzle sobre Postgres y reutiliza la misma imagen para API, worker y
  migraciones.
- `backend/worker/`: workers BullMQ (sync de fuentes externas, geocode,
  deduplicación, federación de hub, migraciones/backfills) sobre Valkey.
  Corre bajo Node — es la pieza que solo funciona en el Camino B (VPS).
- `admin/`: panel de administración como microservicio Next.js standalone
  (RBAC con JWT en cookie httpOnly). Su BFF (`app/api/*`) reenvía al backend
  por la red interna; no es tráfico público.
- `infra/db/`: esquema Drizzle (`schema.ts`, fuente de verdad) y migraciones
  versionadas.
- `infra/cloudflare/`: módulo OpenTofu opcional para la zona de Cloudflare
  del Camino A (DNS, anti-suplantación, CAA, DNSSEC, WAF, cache, rate limit).
  No es requisito del Camino B.
- `config/deployment.config.json`: identidad del despliegue (nombre,
  dominios, centro del mapa, idioma, contacto) — lee de ahí antes de
  hardcodear cualquier dato de branding.

### Despliegue: dos caminos soportados

Ver `CLAUDE.md` → "Dos caminos de despliegue" para la tabla comparativa
completa y el orden de standup. Resumen técnico para quien escribe código:

1. **Camino B — VPS con `docker-compose.prod.yml` + Caddy**
   (`Caddyfile.example`, `docs/deploy-vps.md`). Es el único camino donde
   funciona **todo** el sistema sin adaptación: colas BullMQ/Valkey,
   transacciones interactivas de Postgres (node-postgres) y el panel
   `admin/`.
2. **Camino A — Cloudflare Workers** (primario;
   `docs/runbook-cloudflare-launch.md`). `backend/src/worker.ts` envuelve la
   misma app de Express con `httpServerHandler` de `cloudflare:node` — la
   app **no se reescribe**. Cada `wrangler.jsonc` (frontend/backend/admin)
   necesita `nodejs_compat` y alias de esbuild para módulos que viven fuera
   del paquete (`infra/db/schema.ts`) o que no corren en Workers tal cual
   (`swagger-ui-express` — ver `backend/src/shims/`). **Nunca declares un
   `routes` key en `wrangler.jsonc`** — ver `CLAUDE.md` → "Conocimiento
   operativo" para por qué revienta el deploy en silencio.

   Limitaciones del Camino A, a ojos abiertos — no "arreglarlas" sin
   pensar, son consecuencia directa de correr sobre Workers:
   - **Sin transacciones interactivas de Postgres** (driver HTTP de Neon).
     Ver "PROHIBIDO `db.transaction`" abajo.
   - **`backend/worker/**` (BullMQ/Valkey) no puede correr en Workers en
     absoluto.** Los jobs de fondo van por Cron Triggers
     (`backend/src/services/cron-jobs.ts`) + Cloudflare Queues
     (`backend/src/lib/queue-consumer.ts`) en su lugar — ver "Jobs de fondo"
     abajo.
   - `wrangler.jsonc` del backend deliberadamente **no** lleva binding de
     Hyperdrive ni de D1: el driver de Workers es Neon HTTP, que necesita
     una URL de Neon real — inyectar ahí una cadena de pooling local de
     Hyperdrive rompe casi cualquier consulta.

Para desarrollo local, en cualquiera de los dos caminos, `docker compose` es
la vía cómoda porque levanta Postgres y Valkey por ti.

## Comandos útiles

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
npm test
```

Backend/API/worker:

```bash
cd backend
npm install
npm run dev
npm run typecheck
npm run build
npx tsc --noEmit -p worker/tsconfig.json
```

Admin:

```bash
cd admin
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Stack local completo (vía preferida):

```bash
docker compose up --build
docker compose down
```

Expone `frontend` en `:3000`, `admin` en `:3001`, `backend` en `:8080`,
Postgres en `:5432` y Valkey en `:6379`.

Base de datos:

```bash
cd backend
npm run db:generate
npm run migrate
```

> `npm run migrate` aplica sobre la base que apunte `DATABASE_URL`. Para
> probar algo que necesite datos reales de comportamiento (auth, seeds,
> migraciones) y no quieras usar staging —que por política suele estar casi
> vacía, ver `docs/runbook-cloudflare-launch.md`— usa
> `backend/scripts/local-db.sh start` si existe en tu fork: levanta un
> Postgres local desechable sin depender de `docker compose`.

## Convenciones de implementación

- Mantén las validaciones de entrada en el servidor. No confíes en
  validaciones solo del cliente.
- Usa respuestas de error visibles y accionables. No silencies fallos ni
  devuelvas éxito cuando la escritura no se guardó.
- Evita `as any`, casts innecesarios y helpers duplicados. Busca primero si ya
  existe una función en `frontend/lib/`, `backend/src/lib/` o
  `backend/src/middleware/`.
- Conserva los límites de rate-limit, cache y tamaño de payload salvo que el
  PR explique el riesgo operativo.
- Para cambios de contrato público, actualiza el bloque `@swagger` del route y
  el artefacto OpenAPI que corresponda.
- Para trabajo largo o de terceros (sync, geocode, scrapers, backfills, IA/API
  externa), encola el trabajo y devuelve un estado consultable; no lo
  bloquees en el request path — ver "Jobs de fondo" abajo para el seam que
  funciona en ambos caminos de deploy.
- **Nunca leas variables de entorno en scope de módulo en código alcanzable
  desde `backend/src/worker.ts`** (cualquier módulo importado desde sus
  handlers `fetch`/`scheduled`/`queue`). Un read a nivel de módulo se evalúa
  durante la inicialización global del isolate, **antes** de que el bridge de
  Workers (`bridgeEnv(env)` / `registerJobBindings()` en `worker.ts`) copie
  los bindings a `process.env` — y en scope de módulo, Workers directamente
  prohíbe leer bindings ("Disallowed operation called within global scope").
  El síntoma no es un error: es un valor de config vacío/incorrecto usado en
  silencio. Lee el env **dentro** del cuerpo de la función que lo necesita.
  Esto NO aplica a los módulos del camino `fetch()` ordinario
  (`server.ts`, `config/env.ts`): `nodejs_compat` puebla `process.env` desde
  las vars/secrets de `wrangler.jsonc` antes de que el grafo de imports
  estáticos se evalúe para una petición HTTP normal, así que un read en
  scope de módulo ahí sí es seguro y es como ya funciona el resto del código.

### Endpoints del backend (reglas ESLint, gate en CI)

El backend tiene DOS superficies HTTP y cada una sigue su patrón:

- **`src/public-api/*` — superficie autenticada (integraciones + admin).**
  Es **deny-by-default**: todo va gateado por
  `requireCapability("<recurso>:<verbo>")`. Para un CRUD de modelo no escribas
  el router a mano: añade un `resources/<modelo>.resource.ts` (config) y deja
  que la **fábrica** (`crud-factory.ts`) monte router + valide + audite +
  documente OpenAPI desde esa config. Capacidades CRUD =
  `read | create | edit | delete`; el catálogo fijo vive en
  `src/auth/capabilities.ts` (se siembra en la tabla `capabilities`).
  **Cualquier router bajo `src/public-api/routers/**` pensado para respaldar
  una pantalla de listado del registro genérico de modelos
  (`admin/src/contexts/models/**`) — escrito a mano o generado por la
  fábrica — DEBE devolver `{items: [...]}` en su endpoint de listado, nunca
  un array plano.** Es la forma que la fábrica CRUD siempre produce, y el
  gateway de listado genérico del panel admin la asume para cualquier router
  registrado. Un array plano rompe la pantalla con un 502 silencioso que
  solo un pase E2E detecta, no un test unitario. Ver el comentario de
  cabecera de `backend/src/public-api/routers/deletion-requests.router.ts`
  para el ejemplo canónico.
- **`src/routes/*` — sitio público (anónimo) + admin legado.** Toda mutación
  lleva `requireHuman` (Turnstile) o un gate, salvo excepción documentada (ver
  arriba).
- **Ambas superficies:** toda ruta declara `rateLimit({ scope, limit })`, sin
  excepción. Mantén `@swagger` en los routes escritos a mano; los routers de
  la fábrica CRUD auto-documentan vía sus esquemas Zod.

**Minting una capacidad nueva es un evento de release, no un detalle de
código.** El catálogo de `src/auth/capabilities.ts` solo se sincroniza a la
tabla `capabilities` cuando corre `src/auth/seed.ts` — y eso pasa dentro del
job de migración, **no automáticamente en cada deploy**; sembrar capacidades
nuevas está gateado a que un humano corra ese job. Antes de agregar una
capacidad nueva:

- Si la superficie que estás construyendo no necesita estrictamente un
  límite de permiso nuevo, prefiere **reutilizar** una capacidad existente
  y documenta por qué en un comentario — no bloquees la feature esperando a
  que alguien corra el seed (ver `backend/src/public-api/routers/hospital-supplies.router.ts`
  y su comentario de montaje en `public-api/index.ts` para el patrón).
- Si de verdad necesitas una capacidad nueva, **planifica el run del seed
  como parte de la misma release** — no la agregues al catálogo y la des por
  hecha sin coordinar quién corre el seed y cuándo.
- El actor que queda registrado en auditoría (`audit_log`, capas de
  compensación) siempre sale de `req.user` (la sesión autenticada), **nunca**
  de un campo del body de la petición — un body puede mentir sobre quién
  hizo qué.

### Frontend

- Todo acceso HTTP debe pasar por `frontend/lib/api.ts`,
  `frontend/lib/server-api.ts` o hooks en `frontend/hooks/`.
- El navegador llama al backend por `NEXT_PUBLIC_API_URL`; no asumas
  same-origin para `/api`.
- Las mutaciones públicas que escriben datos sensibles deben obtener un token
  de Cloudflare Turnstile con `useTurnstile()` y enviarlo como
  `turnstileToken` o `cf-turnstile-token`, según el helper existente.
- Mantén TanStack Query como capa de cache/dedup del cliente; no dupliques
  fetch manual cuando ya existe un hook.
- Las URLs de fotos que vengan como rutas relativas deben pasar por
  `mediaUrl()` para anclarlas al backend.
- **No hagas `next/dynamic()` del contenido principal de una ruta cuya única
  razón de ser es ese contenido.** React 19 programa la revelación de un
  Suspense boundary vía `requestAnimationFrame`, que nunca se dispara en una
  pestaña en segundo plano/abierta con ⌘-click/restaurada — la página se
  queda colgada en el fallback de carga para siempre aunque `curl` vea un
  200 completo. Verificación: tras un cambio, el HTML servido de esa ruta
  debe tener **0** ocurrencias de `$RC(` y `<template id="B:`.
- **Nunca bifurques el OUTPUT de render de un componente en
  `typeof window === "undefined"`** (ni un `if (!mounted) return null`
  calculado sincrónicamente en el cuerpo del render, fuera de un hook). El
  servidor renderiza un árbol, el primer render del cliente renderiza otro →
  error de hidratación de React (#418) en cada carga de página. Usa un
  mount-gate en su lugar: `const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), [])`, y decide el valor real de la rama
  dentro de un SEGUNDO efecto una vez montado. Referencia en el repo:
  `hooks/useLowBandwidthMode.ts`, `components/layout/OpenPanelProduction.tsx`.
- **Cualquier superficie nueva de lista/estadísticas (una ruta `/xxx` nueva
  con su propio directorio) sigue el patrón `lib/<dominio>.ts` (tipos puros +
  `buildXUrl` + constante de tamaño de página fija, importable desde server
  y cliente) + `app/.../page.tsx` con `Promise.allSettled` para el prefetch
  SSR** — el mismo patrón que ya usan `lib/missing.ts` +
  `app/(app)/page.tsx`. Saltárselo es exactamente lo que ya causó un
  incidente real en producción: SSR y cliente construyeron `queryKey`s
  distintos y el directorio nunca apareció en el primer paint del lado
  cliente. Un resumen de cabecera de directorio/lista (p.ej. "N reportadas /
  N encontradas") debe leer de su propio endpoint `/stats` dedicado (vía un
  hook compartido), nunca del `total` de una query de lista filtrada — ese
  `total` refleja el filtro activo, no el tamaño real del directorio.
  Distingue siempre "todavía cargando" (`undefined`) de "de verdad vacío"
  (`[]`/`0`) en el copy del estado vacío — un "Cargando…" genérico o un
  vacío ambiguo se lee como "se borró el contenido" para un usuario real en
  medio de una emergencia.
- **`public/sw.js` no tiene build step — no puede importar módulos
  TypeScript.** Cualquier predicado compartido entre el service worker y el
  código de la app (p.ej. "¿este host es la API?") se duplica a mano con un
  comentario que apunte en ambas direcciones (ver `lib/api-host.ts` ↔
  `public/sw.js`'s `isApiRequest`); actualiza los dos juntos.

### Backend/API

- Las rutas viven en `backend/src/routes/`; la lógica de negocio vive en
  `backend/src/services/`. Este patrón simple aplica al sitio público propio.
- **Integraciones con terceros** (APIs externas que proyectamos en un dominio
  propio, p.ej. un directorio de acopio) van como módulos DDD en
  `backend/src/modules/<dominio>/`, no como un `service` plano. Capas con
  dependencias hacia adentro: `domain/` (entidades + value objects + reglas
  puras + el **puerto**/interfaz de la fuente; sin HTTP ni `env`),
  `application/` (casos de uso), `infrastructure/` (adaptadores que
  implementan el puerto: cliente HTTP, mapper anti-corruption, decorador de
  cache), `interface/http/` (router + controller + presenter; única capa con
  Express y el `@swagger`) y `<dominio>-module.ts` (composition root: único
  sitio que lee `env` y cablea todo). Referencia: `backend/src/modules/acopio/`
  y `backend/src/modules/needs/`. Añadir otra fuente externa = otro adaptador
  del mismo puerto en el composition root. El navegador nunca llama al
  tercero directo: siempre se proxea por el backend.
- Cada integración externa opcional se activa con su propio flag
  `ENABLE_*` en `.env.example` (p.ej. `ENABLE_RESPONSEGRID`,
  `ENABLE_HUB_FEDERATION`, `ENABLE_PATIENT_OCR`, `ENABLE_EXAMPLE_SOURCE`).
  Todas empiezan en `false`: el template debe funcionar sin ninguna
  integración de terceros configurada. Si el flag gatea código que corre al
  arrancar el Worker (no solo al atender una request), preferí degradar con
  gracia sobre `process.exit(1)`/throw — un flag mal configurado no debería
  poder tumbar TODA la API, solo la integración que gatea.
- Monta rutas con `Router`, `asyncHandler`, `validate()` y los middlewares
  existentes (`rateLimit`, `requireHuman`, `requireAdmin`, auth de hospital)
  antes de crear helpers nuevos.
- GETs públicos/polleados deben usar `cached()` y/o `jsonWithEtag()` cuando el
  contrato lo permita.
- No uses `*` en CORS. Ajusta `CORS_ORIGINS` para los orígenes frontend
  permitidos.
- Si persistes o comparas IPs, usa `clientIp()` y `hashIp()`; nunca guardes
  IPs crudas.
- `TURNSTILE_SECRET_KEY` ausente desactiva `requireHuman` para desarrollo
  local; en producción debe estar configurada.

### Acceso a datos (Drizzle ORM)

- Todo acceso ordinario a la base va por Drizzle. Importa desde
  `backend/src/db` (`getDb`, `hasDbEnv`, `schema`).
- El esquema es la fuente de verdad en `infra/db/schema.ts`. No crees tablas
  en runtime dentro de la API.
- Si cambias el esquema:
  1. edita `infra/db/schema.ts`,
  2. corre `cd backend && npm run db:generate`,
  3. commitea el `.sql` + el journal en `infra/db/migrations/`.
- El servicio `migrate` de `docker-compose.prod.yml` aplica las migraciones
  antes de que arranquen `backend`/`worker` (Camino B); en el Camino A las
  migraciones son un paso manual contra Neon (ver
  `docs/runbook-cloudflare-launch.md`). En ambos casos las migraciones deben
  ser expand-contract si vas a hacer rollouts sin downtime.
- **Política de cambios de esquema bajo deploys manuales/no atómicos: aditivo
  por defecto.** Si backend y frontend se despliegan de forma independiente y
  las migraciones las corre un humano (no hay gate automático que garantice
  orden), preferí una **tabla nueva** sobre agregar una columna
  discriminadora a una tabla existente ya en producción cuando modelas un
  concepto de dominio nuevo relacionado a uno existente. Una tabla nueva está
  inerte hasta que algún código la lea — cualquier orden de deploy degrada
  con seguridad. Una columna nueva que ya lee código sin desplegar todavía
  (p.ej. un futuro `WHERE kind = 'nuevo_tipo'`) puede romper cada consulta en
  vivo contra esa tabla en el momento exacto en que el código se despliega
  por delante de la migración. Reserva `ALTER` para cambios *absent-safe*
  (columna nueva nullable sin backfill que dependa de un deploy simultáneo).
  Ver el comentario de la tabla `missingPets` en `infra/db/schema.ts` para
  el razonamiento completo con un ejemplo real.

### PROHIBIDO: `db.transaction(...)` interactiva en `backend/src/**` (invariante Workers)

El Camino A (Cloudflare Workers) usa el driver HTTP de Neon, que **no
soporta transacciones interactivas**. Una `db.transaction(async (tx) => …)`
en código alcanzable desde el Worker compila, pasa los tests locales
(node-postgres sí las soporta bajo Node) y **revienta solo en producción**
si tu fork corre el Camino A. Enforced con ESLint
(`backend/eslint-rules/index.js` → `no-interactive-transactions`, flags
cualquier `<obj>.transaction(<fn>)` bajo `backend/src/**`; `backend/worker/**`
está exento porque corre bajo Node/node-postgres, donde sí funcionan).

En su lugar, tres patrones sustitutos:

- **Claim condicional**: `UPDATE … WHERE <estado esperado> RETURNING` como
  sentencia única atómica que reclama una fila — sustituye a `SELECT … FOR
  UPDATE`, y es seguro re-correrlo tras un corte a mitad de camino. Ver
  `backend/src/services/patient-imports/apply.ts`.
- **Ids deterministas** para escrituras reintentables: mismo input de origen
  (p.ej. un hash sha256 del id de la fila de origen) ⇒ mismo id ⇒ el
  re-insert choca en la PK vía `ON CONFLICT` y el reintento es no-op. Ver el
  mismo archivo.
- **Compensación** cuando un paso posterior falla: escrituras secuenciales
  con un delete/undo compensatorio best-effort si un paso más adelante
  falla (crear rol → si fallan las capacidades, borrar el rol). Ver
  `backend/src/services/roles.ts` (`createRole`/`updateRole`/`removeRole`).
- Cuando dos escrituras secuenciales deben quedar coherentes entre sí, un
  **guard de integridad** (verificar que el conteo de filas escritas ==
  total esperado antes de continuar) reemplaza la garantía que daría una
  transacción.
- La duda de siempre: si crees que necesitas una transacción interactiva,
  primero pregúntate si un UPDATE condicional + idempotencia la reemplaza.

Si tu fork solo corre el Camino B (VPS), este invariante no aplica —
node-postgres soporta transacciones interactivas con normalidad — pero el
ESLint rule sigue activo porque protege a cualquier fork que decida migrar
al Camino A después.

### Jobs de fondo (colas y cron, ambos caminos)

Un job nuevo NO se conecta directo a BullMQ ni directo a un binding de
Queues — sigue el seam por capacidad que funciona en los dos caminos de
deploy:

1. **Productor**: binding de Cloudflare Queues si está registrado (Camino
   A); BullMQ con `VALKEY_URL` si no (Camino B). Referencia:
   `backend/src/lib/job-dispatch.ts`. **Mensajes ≤128 KB**: cualquier
   payload pesado se materializa en la base de datos ANTES de encolar — el
   mensaje de cola solo lleva un id/referencia, nunca el dato en sí.
2. **Consumidor**: rama en `backend/src/lib/queue-consumer.ts` (extraído de
   `worker.ts` para ser testeable) + cableado en el handler `queue` de
   `src/worker.ts` (Camino A) o en `backend/worker/` (Camino B). Ack **por
   mensaje**; si falla, `retry()` — los reintentos y el umbral de DLQ los
   configura `wrangler.jsonc`.
3. **Cartas muertas (DLQ)**: el consumidor del DLQ persiste en `audit_log`
   (evento `queue.dead_letter`) y hace ack incondicional. Sin un consumidor
   de DLQ, un mensaje agotado **se pierde** a los pocos días sin que nada lo
   avise.
4. **Colas**: `wrangler queues create <nombre>` para producción **y** para
   staging, antes del primer deploy que las referencia en su config — la
   cola no se crea sola por estar declarada en `wrangler.jsonc`. Declara la
   cola en **ambos** bloques de entorno: a diferencia de `triggers`/cron, el
   bloque `queues` **no se hereda** en `env.staging`.
5. **Verificación**: `scripts/verify-jobs.sh [staging|production]` — chequeo
   de frescura derivado de lo que los jobs ya escriben, sin escrituras
   propias; seguro de correr contra producción.

### Actualizar listas de personas (hospitalizados / refugiados)

Las personas localizadas (en hospital o en refugio/centro de acopio) viven en
`hospital_patients`, ligadas a un lugar en `hospitals`. Conviven en la misma
tabla para que una familia las encuentre en una sola búsqueda, distinguidas
por:

- `hospitals.facility_type`: `"refugio"` para centros de acopio/albergues;
  tipos de hospital para el resto.
- `hospital_patients.status`: `"hospitalized"` o `"sheltered"`.

Son columnas `TEXT`: valores nuevos no requieren migración, pero sí agregar
su etiqueta en `frontend/lib/hospitals-meta.ts` para que el front los muestre
bien.

Para cargas en lote (bulk) de datos reales, usa una herramienta separada,
fuera de la app, que: corra siempre en dry-run primero, dedupe por
identificador único + nombre por lugar, no auto-fusione conflictos, no
invente lugares ni ubicaciones, pida confirmación explícita de un maintainer
antes de aplicar, y nunca escriba PII (nombres, cédulas, diagnósticos) a
repos/issues/PRs/gists.

## Trabajo con múltiples agentes en el mismo repo

Un standup o una operación real suele tener varias sesiones de agente
trabajando a la vez sobre el mismo checkout. Esto es rutina, no una
excepción — trátalo como tal:

- **Cada sesión vive en su propio `git worktree`.** Nunca hagas
  `checkout`/`pull`/`stash`/`reset` en un checkout que otra sesión pueda
  estar usando — puede tirar trabajo ajeno sin ningún error visible (el
  `Write` de un archivo existente sobrescribe sin diff ni confirmación).
- **`fetch` + rebase antes de subir a una rama compartida.** Un push
  rechazado por non-fast-forward en una rama compartida durante trabajo
  concurrente es el estado esperado, no una excepción — resuélvelo con
  `git fetch` + rebase, no con `--force`.
- **Antes de mergear una rama compartida a la de producción, pregunta: "¿qué
  más viaja con este merge?"** Un merge amplio puede arrastrar features de
  otra sesión que todavía no estaban listas para desplegarse. Si no puedes
  confirmar que todo lo que viaja está listo, mergea selectivamente (cherry-
  pick) en vez de mergear la rama entera.
- **Cuando corrijas un bug, pregúntate si existe una copia hermana del mismo
  patrón en otro sitio del código** (una pestaña similar, un componente
  paralelo, una segunda implementación del mismo cálculo) y si el mismo fix
  aplica ahí también. Una implementación correcta sentada al lado de una con
  bug no se auto-copia — solo una revisión que se haga esa pregunta
  explícitamente la encuentra.

## Documentación

- Escribe documentación en español.
- Usa Markdown con líneas razonablemente cortas para diffs legibles.
- Estado actual del sistema va en `docs/architecture.md`; sistema de diseño
  en `docs/DESIGN.md`. Si el proyecto crece, organiza propuestas/decisiones
  en subcarpetas nuevas (`docs/rfcs/`, `docs/adr/`) y enlázalas desde aquí.

## Mapa rápido del repo

```text
frontend/               Next.js UI/SSR, hooks, componentes, assets publicos
frontend/wrangler.jsonc Config del Worker del frontend (Camino A)
frontend/open-next.config.ts  Adaptador Next -> Workers (Camino A)
backend/src/            Express API, servicios, middleware, acceso Drizzle
backend/src/modules/    Integraciones como modulos DDD (dominio/aplicacion/infra/http)
backend/src/worker.ts   Envoltura de Express para Workers (Camino A)
backend/wrangler.jsonc  Config del Worker de la API (Camino A)
backend/worker/         BullMQ workers, sync, migraciones y backfills (Camino B)
admin/                  Panel admin standalone (Next.js: BFF app/api/* + RBAC)
admin/wrangler.jsonc    Config del Worker del panel admin (Camino A)
infra/db/               Esquema Drizzle + migraciones
infra/cloudflare/       Modulo OpenTofu de la zona Cloudflare (Camino A, opcional)
config/                 deployment.config.json (identidad del despliegue)
docs/                   Diseño, arquitectura y runbooks (ver CLAUDE.md)
.github/workflows/deploy-*.yml  Deploys del Camino A (auto frontend, manual backend/admin)
docker-compose.yml      Stack local (dev)
docker-compose.prod.yml Stack de produccion del Camino B (un solo VPS + Caddy)
Caddyfile.example       Config de Caddy con placeholders {$VAR} (Camino B)
.env.example            Contrato completo de variables de entorno
```

## Pull requests

Antes de abrir o actualizar un PR:

- Enlaza la issue que rastrea el trabajo, o explica por qué el cambio es
  pequeño y no la necesita.
- Incluye capturas o video si cambia UI pública.
- Marca los comandos ejecutados (`frontend`/`backend`/`admin` lint,
  typecheck, build, pruebas manuales) o explica por qué no aplican.
- Describe cualquier impacto en privacidad, datos de crisis, performance,
  cache, variables de entorno, despliegue o migraciones.
- Mantén el PR enfocado. Si aparecen cambios vecinos, abre issues separadas.

## Principios de código

- **YAGNI primero.** Antes de escribir código nuevo: ¿ya existe en el repo?
  ¿lo resuelve la librería estándar, una API nativa del framework o una
  dependencia ya instalada? Solo entonces escribe el mínimo código que
  funcione.
- Sin abstracciones no solicitadas. Sin dependencias nuevas si se puede
  evitar. La duplicación es más barata que la abstracción equivocada: no
  extraigas un helper compartido hasta la tercera repetición real.
- Borrar > añadir. Simple > ingenioso. El diff correcto más corto gana.
- Deja cada archivo más limpio de lo que lo encontraste. Borra código muerto
  al verlo.
- Nombres descriptivos, buscables, pronunciables. Sin números mágicos o
  strings sueltos — constantes con nombre.
- Excepciones nunca silenciadas. Errores de negocio con clases específicas.
- Código no trivial sin test = no enviado. Bug fix = test de regresión que
  falla antes del fix y pasa después.
- Antes de dar por terminado: lint clean, typecheck clean, tests verdes.
