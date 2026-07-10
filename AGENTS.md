# AGENTS.md

Guía operativa para agentes de código (y humanos) que trabajen en este
repositorio. Es una **plantilla** para sitios de respuesta a desastres:
mapa/lista de reportes, directorio de hospitales/refugios, centros de acopio,
panel de administración con RBAC y un worker para sincronización/backfills.
No asume ningún evento, país ni organización en particular — toda esa
identidad vive en `config/deployment.config.json` y en variables de entorno.

Si este repo también tiene un `CLAUDE.md`, mantenlo como symlink a este
archivo (no una copia): así un solo documento sirve a ambas herramientas.

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

## Regla de arquitectura

Si cambias la arquitectura real del sistema, no dejes la documentación atrás:

- Actualiza `docs/architecture.md` en el mismo cambio.
- Si cambia una regla que los agentes deben seguir, actualiza este archivo.
- Si agregas variables de entorno, actualiza `.env.example` (grupo correcto,
  marca `[REQ]`/`[OPT]`, valor placeholder obviamente falso).
- Si agregas o cambias un dominio/puerto/servicio, actualiza
  `docker-compose.yml`, `docker-compose.prod.yml` y `Caddyfile.example` a la
  vez que el código que lo necesita.

## Seguridad y privacidad (invariantes duros)

Este tipo de proyecto maneja datos de personas en crisis. GitHub es público y
**no** debe usarse como canal de emergencia ni como base de datos de personas
afectadas.

- **No hardcodees identidad real.** Ningún dominio, IP, email, teléfono,
  nombre de organización/evento, coordenada sensible o handle de red social
  real va en código, config, fixtures, tests o docs. Usa `example.org`,
  `admin@example.org`, variables de entorno, o valores leídos de
  `config/deployment.config.json`. Este repo es una plantilla pública: cada
  despliegue real pone su propia identidad en su `.env` y su
  `deployment.config.json`, nunca en el código.
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
  entorno al arrancar (fail-fast), usa Drizzle sobre Postgres y reutiliza la
  misma imagen para API, worker y migraciones.
- `backend/worker/`: workers BullMQ (sync de fuentes externas, geocode,
  deduplicación, federación de hub, migraciones/backfills) sobre Valkey.
- `admin/`: panel de administración como microservicio Next.js standalone
  (RBAC con JWT en cookie httpOnly). Su BFF (`app/api/*`) reenvía al backend
  por la red interna; no es tráfico público.
- `infra/db/`: esquema Drizzle (`schema.ts`, fuente de verdad) y migraciones
  versionadas.
- `config/deployment.config.json`: identidad del despliegue (nombre,
  dominios, centro del mapa, idioma, contacto) — lee de ahí antes de
  hardcodear cualquier dato de branding.
- Despliegue: un único VPS con `docker-compose.prod.yml` + Caddy
  (`Caddyfile.example`) delante. Ver `docs/architecture.md`.

Para correr el sistema completo, `docker compose` es la vía preferida.

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
  externa), encola en BullMQ y devuelve un estado consultable; no lo
  bloquees en el request path.

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
- **`src/routes/*` — sitio público (anónimo) + admin legado.** Toda mutación
  lleva `requireHuman` (Turnstile) o un gate, salvo excepción documentada (ver
  arriba).
- **Ambas superficies:** toda ruta declara `rateLimit({ scope, limit })`, sin
  excepción. Mantén `@swagger` en los routes escritos a mano; los routers de
  la fábrica CRUD auto-documentan vía sus esquemas Zod.

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
  integración de terceros configurada.
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
  antes de que arranquen `backend`/`worker`. Las migraciones deben ser
  expand-contract si vas a hacer rollouts sin downtime.

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

## Documentación

- Escribe documentación en español.
- Usa Markdown con líneas razonablemente cortas para diffs legibles.
- Estado actual del sistema va en `docs/architecture.md`; sistema de diseño
  en `docs/DESIGN.md`. Si el proyecto crece, organiza propuestas/decisiones
  en subcarpetas nuevas (`docs/rfcs/`, `docs/adr/`) y enlázalas desde aquí.

## Mapa rápido del repo

```text
frontend/               Next.js UI/SSR, hooks, componentes, assets publicos
backend/src/            Express API, servicios, middleware, acceso Drizzle
backend/src/modules/    Integraciones como modulos DDD (dominio/aplicacion/infra/http)
backend/worker/         BullMQ workers, sync, migraciones y backfills
admin/                  Panel admin standalone (Next.js: BFF app/api/* + RBAC)
infra/db/               Esquema Drizzle + migraciones
config/                 deployment.config.json (identidad del despliegue)
docs/                   Diseño y arquitectura
docker-compose.yml      Stack local (dev)
docker-compose.prod.yml Stack de produccion (un solo VPS + Caddy)
Caddyfile.example       Config de Caddy con placeholders {$VAR}
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
