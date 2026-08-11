---
name: disaster-configure
description: Rellena config/deployment.config.json con la identidad de este despliegue (org, producto, desastre, región, mapa, idioma, contacto, dominios) tras un preflight de propiedad del dominio (NS/registrador contra la zona real), y propaga esos valores a los consumidores estáticos que el loader de runtime no puede alcanzar (manifest.webmanifest, vars de dominio en .env, wrangler.jsonc de los tres Workers si el fork usa Cloudflare, event-data.ts, emergency-contacts.ts). Úsalo primero, antes de disaster-brand, disaster-secrets-bootstrap y disaster-deploy-cloudflare/disaster-deploy-vps.
---

# disaster-configure

Primer paso del standup de la plantilla. Sin esto, el sitio arranca con
identidad de ejemplo ("Organización Ejemplo", `mapa.example.org`, teléfonos de
emergencia falsos) — no publicable.

## Qué toca

1. **`config/deployment.config.json`** — fuente de verdad en runtime, cargada
   y validada por `frontend/lib/deployment-config.ts` (falla el build si falta
   una key o sobra una). Set cerrado de keys, no agregues ni quites ninguna:

   ```json
   {
     "orgName": "string",
     "productName": "string",
     "disasterName": "string",
     "disasterType": "string",
     "regionLabel": "string",
     "mapCenter": [lat, lng],
     "mapZoom": number,
     "languageTag": "es",
     "contactEmail": "string",
     "domains": { "web": "string", "api": "string", "admin": "string" }
   }
   ```

2. **Consumidores estáticos que el loader NO reescribe en runtime** — hay que
   editarlos a mano, en el mismo paso:
   - `frontend/public/manifest.webmanifest` — `name`, `short_name`,
     `description`, `lang` (archivo servido tal cual por Next.js; no se genera
     desde el config en build). Deja `theme_color`/`background_color`/iconos
     para `disaster-brand`.
   - `.env` (o `.prod.env`) — `WEB_DOMAIN`, `API_DOMAIN`, `ADMIN_DOMAIN`,
     `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `APP_BASE_URL`, `ADMIN_BASE_URL`,
     `ACME_EMAIL` deben reflejar los mismos dominios que
     `domains.web`/`domains.api`/`domains.admin` y el `contactEmail` de
     `deployment.config.json`. Si `.env` todavía no existe, no lo crees aquí —
     eso es trabajo de `disaster-secrets-bootstrap`; solo anota/verifica que
     los valores de dominio coincidan cuando exista.
   - `frontend/lib/event-data.ts` — metadata sintética del evento sísmico de
     referencia (`SEISMIC_RISK_EVENT`) y la lista de ciudades/zonas en riesgo
     (`SEISMIC_RISK_CITIES`, `SEISMIC_RISK_AOIS`). Reemplaza los valores
     "Ejemplo" por el evento real y las localidades reales afectadas —
     coordenadas, nombres de ciudad/estado, nivel de riesgo, MMI, población.
     Este archivo usa `deploymentConfig.mapCenter` como ancla; si no tienes
     datos reales todavía, como mínimo ajusta los offsets para que caigan
     dentro de la región real (no dejes ciudades inventadas con nombres
     "Ejemplo").
   - `frontend/lib/emergency-contacts.ts` — **números reales de emergencia de
     la región** (bomberos, ambulancias, protección civil, línea de
     emergencia general, etc.). Esto **no se puede inferir ni inventar**:
     pídeselo explícitamente al deployer (quien te esté pidiendo correr este
     skill). Si no te lo ha dado, pregúntale antes de escribir el archivo —
     no rellenes con números de ejemplo ni copies los de otro país al azar.

3. **Si el fork va a usar el camino Cloudflare Workers**
   (`disaster-deploy-cloudflare`, el camino primario de este template) —
   `frontend/wrangler.jsonc`, `backend/wrangler.jsonc` y
   `admin/wrangler.jsonc`, cada uno con un comentario `CHANGE_ME: nombre
   real del Worker` en el `name` de nivel superior y en `env.staging.name`.
   Elige un nombre de Worker por paquete, de-brandeado (p.ej.
   `<slug-del-despliegue>-web`/`-api`/`-admin[-staging]`) — el camino VPS no
   lee estos archivos en absoluto, así que sáltate este punto si el fork se
   queda solo con `disaster-deploy-vps`. De paso, actualiza los `vars` que
   estos archivos ya declaran con dominios de ejemplo
   (`APP_BASE_URL`/`ADMIN_BASE_URL`/`CORS_ORIGINS` en `backend/wrangler.jsonc`,
   `EMERGENCY_API_URL` en `admin/wrangler.jsonc`, y sus contrapartes de
   `env.staging`) para que coincidan con `domains.*` — mismo principio que
   el punto de `.env` de arriba, pero para wrangler.
4. **`frontend/config/`, `lib/generated/brand-logo.ts`,
   `public/llms.txt`** — copias/artefactos de build derivados de
   `config/deployment.config.json`, generados por
   `frontend/scripts/sync-deployment-config.mjs` /
   `generate-brand-logo.mjs` / `generate-llms-txt.mjs` (los tres corren
   juntos como `npm run codegen`, y el hook `predev`/`prebuild` ya los
   dispara solo antes de `next dev`/`build`). No los edites a mano — si vas
   a inspeccionarlos antes de levantar `next dev`, solo corre
   `cd frontend && npm run codegen` para refrescarlos con la identidad
   nueva. Sin esto, cualquier build que lea la copia local en
   `frontend/config/` ve la identidad VIEJA hasta el primer
   `dev`/`build`/`typecheck`.

## Preflight de dominio (antes de fijarlo en el config)

No escribas un dominio en `domains.web`/`domains.api`/`domains.admin` solo
porque el deployer lo dijo — un despliegue real de este template llegó a
producción con `deployment.config.json` apuntando a un `.app` que resultó
estar registrado por otra persona, mientras el dominio realmente controlado
(y ya zoneado en Cloudflare) era el `.co` — nadie lo notó hasta cruzar a mano
fechas de WHOIS. Antes de escribir cualquier dominio en el config:

```bash
dig NS <dominio-propuesto> +short
whois <dominio-propuesto> | grep -i "registrar\|creation date"
```

**Detente y pregunta al deployer si:**
- Los NS no apuntan ya a la cuenta de Cloudflare que vas a usar (o el
  deployer no puede confirmar que esa cuenta/ese registrador es suyo).
- Hay variantes "lookalike" del mismo nombre en otros TLD o con pequeñas
  variaciones registradas el mismo día — puede ser una coincidencia
  inocente o un dominio de phishing oportunista sobre el mismo evento; si
  existen, avísale al deployer aunque no bloquee este paso, es información
  que necesita para comunicar cuál es el dominio real.
- El dominio no lo controla el deployer en absoluto (dominio de otro
  proyecto, typo, o un TLD que "sonaba bien" pero nadie registró todavía).

Si algo de esto no cuadra, no adivines ni sigas adelante "por ahora" — el
resto del standup (incluyendo `disaster-deploy-cloudflare`, que crea la
zona/DNS reales sobre lo que escribas aquí) hereda este valor como fuente de
verdad.

## Pasos

1. Pide (o confirma que ya tienes) del deployer: nombre de la organización,
   nombre del producto/sitio, nombre del desastre/evento, tipo de desastre,
   etiqueta de región, centro del mapa (lat/lng) y zoom inicial, opcionalmente
   un bounding box inicial `[south, west, north, east]` si quieres que el
   mapa encuadre una región/impacto en vez de solo centrar+zoom (`mapBbox`,
   ver abajo), idioma (BCP-47), email de contacto, los tres dominios
   (web/api/admin — pasados por el preflight de arriba), y la lista de
   números de emergencia reales de la región.
2. Edita `config/deployment.config.json` con esos valores. No agregues keys
   fuera del set cerrado documentado arriba — `deployment-config.ts` rechaza
   keys desconocidas y falla el build. `mapBbox` es una key OPCIONAL ya
   soportada por el loader (`[south, west, north, east]`, cuatro números) —
   agrégala solo si el deployer te dio (o puedes derivar) un encuadre real;
   sin ella el mapa sigue funcionando con `mapCenter`/`mapZoom` como antes.
3. Edita `frontend/public/manifest.webmanifest`: `name`, `short_name`,
   `description`, `lang`. Deja el resto (colores, iconos, shortcuts) intacto
   — eso es `disaster-brand`.
4. Reemplaza el contenido de `frontend/lib/event-data.ts` con el evento y las
   localidades reales (o, si aún no hay datos reales, con offsets de
   coordenadas dentro de la región real en vez de los de ejemplo).
5. Reemplaza `EMERGENCY_CONTACT_GROUPS` en
   `frontend/lib/emergency-contacts.ts` con los números reales de emergencia
   de la región, agrupados igual que el ejemplo (bomberos, ambulancias,
   protección civil, etc. según aplique).
6. Si ya existe un `.env`/`.prod.env` (es decir, si `disaster-secrets-bootstrap`
   ya corrió), actualiza `WEB_DOMAIN`, `API_DOMAIN`, `ADMIN_DOMAIN`,
   `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `APP_BASE_URL`, `ADMIN_BASE_URL` y
   `ACME_EMAIL` para que coincidan con `domains` y `contactEmail` del config.
   Si no existe todavía, no lo crees — señala al deployer que corra
   `disaster-secrets-bootstrap` a continuación.
7. Si el fork va por el camino Cloudflare Workers, edita los tres
   `wrangler.jsonc` (punto 3 de "Qué toca" arriba) y corre
   `cd frontend && npm run codegen` para refrescar la copia local del
   config y los artefactos generados (punto 4). Si va por el camino VPS,
   sáltate este paso.

## Verificación (obligatoria antes de dar por terminado)

1. **El JSON es válido y cierra el schema:**
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('config/deployment.config.json','utf8'))"
   ```
2. **El build de frontend pasa** (el loader de `deployment-config.ts` valida
   el shape en tiempo de import — si falta una key, sobra una, o
   `mapCenter`/`mapZoom` no son números válidos, el build falla con un
   mensaje `[deployment-config] ...`):
   ```bash
   cd frontend && npm run build
   ```
3. **El mapa centra en la región configurada** — no hace falta levantar el
   dev server para confirmarlo: los componentes de mapa
   (`frontend/components/features/emergency/index.tsx`,
   `MapPanel.tsx`, `seismic/SeismicRiskLeafletMap.tsx`,
   `responsegrid/AcopioMap.tsx`) leen `deploymentConfig.mapCenter` /
   `deploymentConfig.mapZoom` directo, así que basta confirmar que el config
   tiene las coordenadas correctas:
   ```bash
   node -e "console.log(require('./config/deployment.config.json').mapCenter, require('./config/deployment.config.json').mapZoom)"
   ```
   Si quieres confirmación visual, corre `cd frontend && npm run dev`, abre
   `/` y verifica que el mapa abre centrado en la región (no en la
   coordenada de ejemplo `[19.4326, -99.1332]`).
4. Ningún valor de `"Ejemplo"` / `example.org` debe quedar en
   `deployment.config.json`, `manifest.webmanifest` (name/short_name/
   description) ni en `emergency-contacts.ts`. Confirma con:
   ```bash
   grep -in "ejemplo\|example.org" config/deployment.config.json frontend/public/manifest.webmanifest frontend/lib/emergency-contacts.ts
   ```
   Debe devolver vacío (o solo comentarios explicativos que no son datos, si
   quedara alguno revísalo a mano).

## Hard stop

No marques esto como terminado si:
- `frontend/lib/emergency-contacts.ts` sigue con "ejemplo"/`911`/números
  placeholder y el deployer no te ha dado los números reales — pídeselos, no
  los inventes.
- `npm run build` en `frontend/` falla.
- Quedan keys desconocidas o faltantes en `deployment.config.json` (el build
  ya te lo dice, pero confírmalo).

## Siguiente paso

Con la identidad y los datos reales en su sitio, continúa con
`disaster-brand` (colores/logo) y luego `disaster-secrets-bootstrap`, y de
ahí a `disaster-deploy-cloudflare` (camino primario) o `disaster-deploy-vps`
(alternativa).

Cuando el fork esté listo para hacerse público (repo visible, o compartido
fuera de quien lo está preparando), recuerda que `disaster-content-audit`
espera que el fork haya pasado de "modo template" a "modo despliegue"
(`scripts/content-audit/mode`) — ese flip vive documentado en
`disaster-content-audit`, no aquí; no lo hagas tú mismo como parte de este
skill, solo ten presente que es un paso pendiente antes del audit final.
