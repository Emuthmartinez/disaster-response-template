---
name: disaster-configure
description: Rellena config/deployment.config.json con la identidad de este despliegue (org, producto, desastre, región, mapa, idioma, contacto, dominios) y propaga esos valores a los consumidores estáticos que el loader de runtime no puede alcanzar (manifest.webmanifest, vars de dominio en .env, event-data.ts, emergency-contacts.ts). Úsalo primero, antes de disaster-brand, disaster-secrets-bootstrap o disaster-deploy-vps.
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

## Pasos

1. Pide (o confirma que ya tienes) del deployer: nombre de la organización,
   nombre del producto/sitio, nombre del desastre/evento, tipo de desastre,
   etiqueta de región, centro del mapa (lat/lng) y zoom inicial, idioma
   (BCP-47), email de contacto, los tres dominios (web/api/admin), y la lista
   de números de emergencia reales de la región.
2. Edita `config/deployment.config.json` con esos valores. No agregues keys
   fuera del set cerrado documentado arriba — `deployment-config.ts` rechaza
   keys desconocidas y falla el build.
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
`disaster-brand` (colores/logo) y luego `disaster-secrets-bootstrap`.
