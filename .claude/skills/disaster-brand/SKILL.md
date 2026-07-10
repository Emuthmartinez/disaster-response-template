---
name: disaster-brand
description: Aplica la marca real del deployer (nombre de organización, colores, logo) reescribiendo los tokens de docs/DESIGN.md, las variables CSS de marca, manifest.webmanifest, los SVG de hero/icon y la metadata SEO. Rehúsa correr si config/deployment.config.json todavía tiene valores de example.org — corre disaster-configure primero.
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
   completo por una versión vectorial del logo (no un binario).
5. **`frontend/public/hero-placeholder.svg`** — gradiente de fondo del hero
   (`linearGradient#bg`, `radialGradient#glow`) y el pin central. Actualiza
   los `stop-color` a la nueva paleta.
6. **`frontend/app/opengraph-image.tsx`** y **`frontend/app/twitter-image.tsx`**
   — imágenes sociales generadas en runtime con `next/og`. Actualiza el
   `linearGradient` inline (`background: "linear-gradient(135deg, #102a43 ...
   #1e40af 100%)"`) y el color del círculo interior del logo (`background:
   "#1e40af"`) en AMBOS archivos a la vez — deben quedar idénticos entre sí.
7. **SEO metadata** — `frontend/lib/metadata.ts` y `frontend/lib/site.ts` ya
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
   `frontend/app/twitter-image.tsx` (idénticos entre sí).
7. Si el deployer proveyó un logo real (archivo SVG), colócalo reemplazando
   `frontend/app/icon.svg` y el motivo de `hero-placeholder.svg`/las imágenes
   OG — nunca generes tú un logo nuevo desde cero para una organización real.

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

## Hard stop (recordatorio)

No corras este skill si `config/deployment.config.json` sigue con valores de
`example.org`/"Ejemplo". Dirige al deployer a `disaster-configure` primero.
