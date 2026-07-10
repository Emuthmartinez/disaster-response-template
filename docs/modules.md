# Registro de módulos opcionales

Toda integración con un tercero en este template está apagada por defecto y
se enciende con su propio flag `ENABLE_*` en `.env.example`. El template
completo — mapa, reportes, hospitales/refugios, panel admin — funciona sin
ninguno de estos módulos configurado. Enciende solo el que de verdad
necesites, y trátalo como una decisión con su propia superficie de
vendor/compliance, no como un checkbox gratis.

Los cuatro módulos actuales:

| Flag | Qué hace | Vendor/superficie |
|---|---|---|
| `ENABLE_RESPONSEGRID` | Directorio de centros de acopio + publicar necesidades de insumos | API pública de terceros (ResponseGrid) |
| `ENABLE_HUB_FEDERATION` | Sincroniza reportes con despliegues hermanos del mismo template + réplica SQL pública opcional | Tu propia infraestructura hermana, o un consumidor de datos externo |
| `ENABLE_PATIENT_OCR` | Extrae registros de pacientes desde fotos/PDF de listas de hospital vía un proveedor de visión (VL) | API de terceros que recibe imágenes con PII/datos de salud |
| `ENABLE_EXAMPLE_SOURCE` | Fuente de sincronización de ejemplo (fixture sintético, sin red) — el patrón para tu fuente real | Ninguno (fixture en el propio repo) |

---

## `ENABLE_RESPONSEGRID`

Proxea el directorio público de centros de acopio de
[ResponseGrid](https://responsegrid.app) y, opcionalmente, publica
necesidades de insumos hacia esa misma plataforma. El navegador nunca llama a
ResponseGrid directo — todo pasa por el backend (`backend/src/modules/acopio/`
para lectura, `backend/src/modules/needs/` para escritura), que controla
cache, contrato y CORS.

**Endpoints que expone:** `GET /api/acopio` (lista de centros, cacheada),
`POST /api/needs` (publicar una necesidad, mutación pública con Turnstile +
rate-limit) + `GET /api/needs/status/{jobId}` (poll del resultado).

**Variables requeridas** (solo si `ENABLE_RESPONSEGRID=true`):

- `RESPONSEGRID_API_URL` — URL base de la API pública de ResponseGrid.
- `RESPONSEGRID_EMERGENCY_SLUG` — identificador de tu emergencia/instancia en
  ResponseGrid.
- `RESPONSEGRID_API_KEY` — solo si vas a **publicar** necesidades (no hace
  falta para solo leer el directorio). Sin ella, `POST /api/needs` responde
  `503` en vez de fallar de forma confusa.

**Superficie de vendor/compliance:** dependes de la disponibilidad y los
términos de servicio de ResponseGrid; la publicación de necesidades envía un
campo `author` (contacto de quien reporta, marcado `verified: false` por el
servidor) a un tercero — revisa su política de datos antes de activar la
escritura.

## `ENABLE_HUB_FEDERATION`

Dos capacidades relacionadas pero independientes, ambas bajo este flag:

1. **Federación de reportes** (`backend/worker/hub/`): el worker sincroniza,
   por polling de solo lectura, cinco tipos de registro (`missing_person`,
   `checkin`, `help_request`, `help_offer`, `damaged_building`) desde un hub
   central hacia tablas propias `hub_*`. Excluye tus propias `source`s
   (`HUB_OWN_SOURCES`) para no re-ingerir lo que tú mismo publicaste — evita
   un bucle de eco entre instancias hermanas del mismo template.
2. **Réplica SQL pública** (opcional, backend `backend/src/services/
   hub-credentials.ts` + su router en `public-api`): un segundo Postgres de
   solo lectura recibe por replicación lógica solo columnas explícitamente
   permitidas (`HUB_PUBLIC_COLUMNS` — nunca PII directa: nombres de personas
   sí, documentos/notas médicas/contacto no) para que un despliegue hermano
   pueda leer datos agregados. Un super admin (`mirror:manage`, requiere
   `users.is_super_admin`, no basta con ser admin normal) emite/revoca
   credenciales por consumidor. Esta pieza degrada sola a `503` si falta su
   configuración (`HUB_ADMIN_DATABASE_URL` y el resto de variables de
   Postgres/firewall del hub) — no está atada estrictamente al flag en
   código, pero documentalmente vive bajo el mismo paraguas porque comparte
   la misma decisión de "¿vas a federar con otras instancias?".

**Variables requeridas** (solo si `ENABLE_HUB_FEDERATION=true`):

- `HUB_BASE_URL` — URL del hub central del que vas a leer.
- `HUB_PAGE_LIMIT` — tamaño de página del polling (opcional, tiene default).
- `HUB_OWN_SOURCES` — csv de tus propios `source` ids, para no re-ingerirte.
- `HUB_PUBLIC_HOST` / `HUB_DB_NAME` / `HUB_ADMIN_DATABASE_URL` — solo si
  además vas a **exponer** tu propia réplica pública (capacidad 2).

**Superficie de vendor/compliance:** esto es compartir datos entre
organizaciones. Antes de encenderlo, ten claro qué instancia es la fuente de
verdad de qué dato, qué pasa si una de las dos se cae, y qué columnas exactas
vas a permitir en la réplica pública si expones una — el allowlist explícito
en `HUB_PUBLIC_COLUMNS` es intencional (agregar una tabla nueva al hub no la
expone automáticamente).

## `ENABLE_PATIENT_OCR`

Habilita la extracción de registros de pacientes desde imágenes/PDF de
listas de hospital vía un proveedor de visión (VL) compatible con la API de
OpenAI (por defecto, MiniMax). Sin este flag, la ruta de importación por
imagen responde `501` — el flujo de importación **manual** (CSV/texto) sigue
funcionando siempre, con o sin este módulo.

**Variables requeridas** (solo si `ENABLE_PATIENT_OCR=true`):

- `MINIMAX_API_KEY` — credencial del proveedor de visión.
- `MINIMAX_OCR_BASE_URL`, `MINIMAX_OCR_MODEL` — endpoint y modelo.
- `MINIMAX_OCR_MAX_TOKENS`, `MINIMAX_OCR_TIMEOUT_MS`, `MINIMAX_OCR_PROMPT` —
  opcionales, tienen default.

**Superficie de vendor/compliance — la más sensible de las cuatro.** Esto
envía imágenes que pueden contener nombres, documentos de identidad y notas
médicas a una API de un tercero. Antes de activarlo:

- Confirma que el proveedor de OCR que elijas tiene un acuerdo de
  procesamiento de datos adecuado para datos de salud en tu jurisdicción.
- Las filas extraídas entran como `needs_review` en staging
  (`patient_imports`/`patient_import_rows`) y **nunca se auto-aplican** — un
  humano confirma antes de que lleguen a `hospital_patients`. No cambies ese
  comportamiento sin una razón documentada.
- El documento de identidad crudo nunca se expone en respuestas públicas; la
  deduplicación usa un hash HMAC (`PATIENT_DOCUMENT_HASH_SECRET`), no el
  documento en texto plano.

## `ENABLE_EXAMPLE_SOURCE` — y cómo agregar tu propia fuente real

Este flag habilita `backend/worker/sync/sources/example-source.ts`: un
adaptador que no llama a ninguna red, sirve tres registros sintéticos
(`Persona Ejemplo Uno/Dos/Tres`) desde un fixture en el propio archivo, y
existe solo para que este documento tenga un ejemplo funcionando de punta a
punta sin depender de un tercero real.

El motor de sincronización (`backend/worker/sync/engine.ts`) no sabe de
dónde viene un registro — solo conoce la forma canónica `ExternalPerson`
(`backend/worker/sync/types.ts`). Todo lo demás (upsert, deduplicación,
reintentos, rate limiting) lo resuelve el motor; un adaptador **solo** trae y
normaliza datos.

### Walkthrough: construir un adaptador real a partir del ejemplo

1. **Copia el archivo:** `backend/worker/sync/sources/example-source.ts` →
   `backend/worker/sync/sources/<tu-fuente>.ts`.
2. **Reemplaza `fetchAll`** (y `fetchPage` si tu fuente pagina) por llamadas
   `fetch()` reales contra la API/HTML/CSV de tu fuente. Usa
   `ctx.userAgent`, `ctx.signal` (timeout/abort) y honra `ctx.limit`/
   `ctx.statusFilter` si tu fuente los soporta.
3. **Mapea la forma de tu fuente a `ExternalPerson`** — mira `mapPerson` en
   el ejemplo para los campos mínimos requeridos (`externalId`, `source`,
   `name`, `status`).
4. **Registra tu adaptador en `backend/worker/sync/sources/index.ts`**,
   siguiendo el patrón existente: un `import` + una línea condicionada a tu
   propio flag `ENABLE_*` nuevo (documéntalo en `.env.example`, empezando en
   `false`). Nunca actives una fuente real por defecto en este template.
5. **No importes datos de contacto** (`contact` en `ExternalPerson`) salvo
   que lo actives explícitamente por su propio flag — importar teléfono/
   email de una persona reportada desaparecida sin que ella lo haya
   consentido es, en sí mismo, un riesgo de extorsión (ver el comentario en
   `../types.ts`).

Tras registrar tu fuente, actívala con `ENABLE_<TU_FUENTE>=true` y, si
quieres, acótala junto a otras fuentes activas con `SYNC_SOURCES` (csv de
ids) y el scheduler general `SYNC_SCHEDULERS=1`.

**Superficie de vendor/compliance:** depende enteramente de tu fuente real —
revisa sus términos de uso/scraping antes de automatizar la lectura, y
recuerda que estás importando información sobre personas desaparecidas: trátala
con el mismo cuidado que cualquier otro dato sensible del sistema (ver
`SECURITY.md`).

---

## Donaciones — backend listo, sin punto de entrada en la UI pública

A diferencia de los módulos de arriba, el backend de donaciones
(`backend/src/routes/donations.ts` + `backend/src/services/donations.ts`,
`GET`/`POST /api/donations`) no está gateado por un flag `ENABLE_*`: siempre
está montado, y las variables opcionales `PAYPAL_DONATION_URL` /
`NEXT_PUBLIC_STRIPE_DONATION_URL` determinan si las respuestas incluyen una
URL de pago real. El panel admin ya tiene su pestaña de donaciones para
revisar lo recaudado. El template **no** incluye un componente de donación
en el sitio público — el CTA "Donar" que sí ves en la nav enlaza a WhatsApp
(`RESPONSEGRID_DONATE_WHATSAPP_URL`) o al directorio externo `/donaciones`,
sin pasar por este backend. Esto es intencional, no un bug: si tu deployment
quiere cobrar donaciones vía PayPal/Stripe desde su propia UI, el backend ya
está listo para eso — construye tu propio formulario/modal contra estos
endpoints (`frontend/lib/donation-shared.ts` ya trae los helpers de
validación/formato compartidos) y móntalo donde tenga sentido en tu diseño
(header, footer, página dedicada).
