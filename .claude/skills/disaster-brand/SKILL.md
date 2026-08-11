---
name: disaster-brand
description: Aplica la marca real del deployer (nombre de organización, colores, logo) reescribiendo los tokens de docs/DESIGN.md, las variables CSS de marca, manifest.webmanifest, los SVG de hero/icon, los iconos raster generados (npm run icons) y la tarjeta social generada (next/og, vía codegen — nunca node:fs). Rehúsa correr si config/deployment.config.json todavía tiene valores de example.org — corre disaster-configure primero.
---

# disaster-brand

Segundo paso del standup. Este repo ya separa **identidad de despliegue**
(`config/deployment.config.json`, texto: nombres, dominios, contacto) de
**identidad visual** (colores, logo, tipografía — lo que toca este skill).
`disaster-configure` no toca ninguno de los archivos de este skill.

## Hard stop — corre esto primero

Antes de tocar nada, verifica que `disaster-configure` ya corrió:

```bash
grep -in "ejemplo\|example.org" config/deployment.config.json
```

Si esto devuelve alguna línea (`orgName`, `productName`, `domains.web`, etc.
todavía en "Organización Ejemplo" / `mapa.example.org`), **detente** y dile al
deployer que corra `disaster-configure` primero. Rebrandear encima de una
identidad de ejemplo produce un sitio con logo/colores reales pero texto
"Organización Ejemplo" — peor que no tocar nada.

## Qué necesitas del deployer

- Nombre de la organización (ya debería estar en `deployment.config.json` —
  solo confírmalo).
- Paleta: como mínimo `primary` (fondo hero/nav oscuro), `secondary`/
  `action-blue` (acento de acción, botones primarios, círculo del pin del
  logo) y `tertiary`/`crisis-red` (alertas, botón de reporte). Si el deployer
  solo da 2-3 colores, deriva el resto (hover, superficie, dark-mode) con la
  misma lógica que ya usa `docs/DESIGN.md` (variantes más oscuras para hover,
  versión "surface" clara para fondos de aviso).
- Logo: si el deployer da un logo real, es un asset — no lo generes tú (no
  crear binarios, ver reglas del repo); pide el archivo y colócalo donde
  correspondan `frontend/app/icon.svg` u otro. Si NO hay logo, mantén el
  motivo actual (pin de mapa) pero con los colores nuevos — no inventes un
  logo distinto.

## Qué toca (rutas reales, verificadas en este repo)

1. **`docs/DESIGN.md`** — front-matter YAML con los tokens de color
   (`colors.primary`, `colors.secondary`, `colors.tertiary`,
   `colors.brand-navy`, `colors.brand-blue`, `colors.action-blue`,
   `colors.crisis-red`, `colors.crisis-red-hover`, etc.) y el título/
   `description` de cabecera. Es la fuente de verdad visual — actualízala
   primero, todo lo demás debe quedar consistente con estos valores.
2. **`frontend/app/globals.css`** — variables CSS de marca en `:root`
   (busca el bloque que empieza en `--brand-navy`, `--brand-blue`,
   `--brand-blue-dark`, `--brand-blue-light`, `--brand-gray-*`; también hay
   alias `--qi-azul`/`--qi-azul-score` que apuntan a esas mismas variables —
   no los borres, solo cambia el valor base). Los tokens `--color-red-*`,
   `--color-emerald-*`, `--color-slate-*` etc. son la escala neutra/semántica
   (peligro, éxito, texto) — normalmente NO cambian con el rebrand salvo que
   el deployer pida una paleta semántica distinta.
3. **`frontend/public/manifest.webmanifest`** — `theme_color` y
   `background_color` (deja `name`/`short_name`/`description`/`lang` como los
   dejó `disaster-configure`).
4. **`frontend/app/icon.svg`** — favicon/app icon (32×32, fondo redondeado +
   motivo). Ajusta el `fill` del `rect` de fondo y del `circle` interior a los
   nuevos colores primary/secondary. Si hay logo real, reemplaza el SVG
   completo por una versión vectorial del logo (no un binario). Este archivo
   es la ÚNICA fuente de verdad del logo — todo lo demás en este skill
   (iconos raster, tarjeta social) se deriva de él por codegen, ver los dos
   puntos siguientes.
5. **Iconos raster** (`frontend/public/favicon-32.png`,
   `favicon-64.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
   `favicon.ico`) — un SVG único no basta en la práctica: "añadir a inicio"
   de iOS, varios launchers de Android y algunos crawlers de preview social
   no leen SVG de forma fiable y necesitan un PNG en un tamaño concreto.
   **`frontend/scripts/generate-icons.mjs` (`npm run icons`) los rasteriza a
   partir de `app/icon.svg` — corre este comando manualmente después de
   reemplazar el icono, NO se dispara solo.** A propósito no forma parte de
   `npm run codegen`/`predev`/`prebuild` (regenerar iconos en cada build
   sería trabajo repetido para un archivo que casi nunca cambia) — así que
   si te saltas este paso, el favicon/app-icon del sitio en vivo sigue
   siendo el viejo aunque `app/icon.svg` ya tenga el logo real. Necesita la
   dependencia `sharp` instalada (`cd frontend && npm install` si no está).
6. **`frontend/public/hero-placeholder.svg`** — gradiente de fondo del hero
   (`linearGradient#bg`, `radialGradient#glow`) y el pin central. Actualiza
   los `stop-color` a la nueva paleta.
7. **`frontend/app/opengraph-image.tsx`** y **`frontend/app/twitter-image.tsx`**
   — imágenes sociales generadas en runtime con `next/og`. Actualiza el
   `linearGradient` inline (`background: "linear-gradient(135deg, #102a43 ...
   #1e40af 100%)"`) y el color del círculo interior del logo (`background:
   "#1e40af"`) en AMBOS archivos a la vez — deben quedar idénticos entre sí.
   **Nunca leas `app/icon.svg` con `node:fs` dentro de estos dos archivos ni
   de `lib/social-preview.tsx`** — funciona en `next build` (Node, con
   `public`/`app` en disco) pero revienta en el Worker de Cloudflare, donde
   en tiempo de petición solo existe el bundle
   (`Error: no such file or directory, readAll '/bundle/app/icon.svg'`), y
   el error solo aparece desplegado, nunca en un build local en verde. El
   logo ya llega como data URI incrustado en build-time vía
   `frontend/scripts/generate-brand-logo.mjs` → `lib/generated/brand-logo.ts`
   (parte de `npm run codegen`, se regenera solo en cada
   `dev`/`build`/`typecheck` — no necesitas correrlo a mano como el punto
   5). Si tocas el logo, solo reemplaza `app/icon.svg`; ese script se
   encarga del resto.
8. **SEO metadata** — `frontend/lib/metadata.ts` y `frontend/lib/site.ts` ya
   leen `orgName`/`productName` desde `deploymentConfig` dinámicamente; no
   necesitan edición de texto. Solo revisa que no haya un color u og-image
   hardcodeado fuera de los dos archivos del punto 6 (`grep -rn "102a43\|1e40af\|2b51f0" frontend/app frontend/lib` para encontrar cualquier otro sitio con los colores viejos hardcodeados).

## Pasos

1. Corre el hard-stop check de arriba.
2. Actualiza `docs/DESIGN.md` con la paleta real (mínimo: `primary`,
   `secondary`, `tertiary`, y sus derivados `crisis-red-hover`,
   `action-blue`, `brand-navy`, `brand-blue`). Mantén el resto de la
   estructura del YAML intacta (typography, rounded, spacing, components) —
   este skill es solo color/logo, no rediseño de layout.
3. Replica los mismos valores hex en `frontend/app/globals.css` (`:root`,
   bloque `--brand-*`).
4. Actualiza `theme_color`/`background_color` en
   `frontend/public/manifest.webmanifest`.
5. Actualiza `frontend/app/icon.svg` y `frontend/public/hero-placeholder.svg`.
6. Actualiza el gradiente/círculo en `frontend/app/opengraph-image.tsx` y
   `frontend/app/twitter-image.tsx` (idénticos entre sí) — nunca agregues
   ahí una lectura de `app/icon.svg` con `node:fs`, ver el punto 7 de "Qué
   toca".
7. Si el deployer proveyó un logo real (archivo SVG), colócalo reemplazando
   `frontend/app/icon.svg` y el motivo de `hero-placeholder.svg`/las imágenes
   OG — nunca generes tú un logo nuevo desde cero para una organización real.
8. **`cd frontend && npm run icons`** — regenera el set de PNG raster a
   partir del `icon.svg` que acabas de dejar en su versión final. No lo
   saltes: es el único paso de este skill que no corre solo en el próximo
   build.

## Verificación

1. Sin colores viejos sueltos fuera de los archivos que los cambiaste:
   ```bash
   grep -rn "102a43\|1e40af\|2b51f0\|c41a1a" frontend/app frontend/lib docs/DESIGN.md
   ```
   Confirma que cada resultado es intencional (o ya está actualizado a la
   paleta nueva) y no un rincón olvidado.
2. `docs/DESIGN.md` sigue siendo YAML válido en el front-matter:
   ```bash
   node -e "require('js-yaml')" 2>/dev/null || echo "js-yaml no instalado, revisa el YAML a mano (indentación, comillas en valores hex)"
   ```
   Si no hay `js-yaml` disponible, revisa a mano que la indentación y las
   comillas de los valores hex (`"#102A43"`) sigan intactas.
3. `cd frontend && npm run lint && npm run typecheck && npm run build` — el
   rebrand no debe romper nada de TypeScript/ESLint (los archivos que tocas
   son CSS/SVG/JSON/TSX simples, pero confírmalo).
4. Visual: `cd frontend && npm run dev`, abre `/` y revisa que el hero, el
   favicon de la pestaña y el botón de reporte usan la paleta nueva.
5. Vista previa social: comparte una URL local o revisa
   `/opengraph-image` y `/twitter-image` (Next.js las sirve en esas rutas)
   para confirmar que el gradiente cambió.
6. **Iconos raster presentes y no vacíos** — confirma que `npm run icons`
   sí corrió y produjo archivos reales, no solo que el comando no falló:
   ```bash
   ls -la frontend/public/favicon-32.png frontend/public/favicon-64.png \
          frontend/public/apple-touch-icon.png frontend/public/icon-192.png \
          frontend/public/icon-512.png frontend/public/favicon.ico
   ```
7. **La imagen social sobrevive en el Worker, no solo en `next build`
   local** — un build local en verde NO prueba que
   `opengraph-image`/`twitter-image` funcionan desplegados (ver el punto 7
   de "Qué toca"). Si el fork va por el camino Cloudflare, después del
   primer deploy pega directo a la ruta desplegada (`curl -I
   https://<tu-dominio>/opengraph-image`) y confirma `200`, no un 500 — un
   `node:fs` colado ahí pasa el build pero revienta solo en producción.

## Content-audit y assets de marca reales

Si el logo real del deployer no cabe en `frontend/app/icon.svg`/
`frontend/public/` (p.ej. el deployer entrega un kit de marca completo con
variantes que prefieres commitear en un directorio propio como `brand/` en
la raíz), ten presente que `disaster-content-audit` en modo `template`
(el default) sigue baneando cualquier extensión raster fuera de
`frontend/public/`/`frontend/app/` — y ese es el modo en el que corre este
repo hasta que alguien lo cambie explícitamente. No lo relajes tú mismo
editando `scripts/content-audit/run.sh` o `banned-patterns.txt`: ese ajuste
vive en `scripts/content-audit/asset-allow.local.txt` (gitignored, solo se
lee en modo `deployment`) y el propio flip de modo es responsabilidad del
deployer al final del standup — ver la sección de modo en
`disaster-content-audit`. Si terminas este skill y el deployer todavía está
en modo `template` con assets fuera del allowlist por defecto, díselo
explícitamente en vez de dejar que lo descubra como un hallazgo rojo en el
audit final.

## Hard stop (recordatorio)

No corras este skill si `config/deployment.config.json` sigue con valores de
`example.org`/"Ejemplo". Dirige al deployer a `disaster-configure` primero.
