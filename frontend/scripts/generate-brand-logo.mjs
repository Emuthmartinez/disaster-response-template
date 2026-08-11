// Genera lib/generated/brand-logo.ts a partir de app/icon.svg.
//
// Por que existe este paso:
//
// La tarjeta social (lib/social-preview.tsx) necesita los BYTES del logo, no
// una URL. Leerlo con node:fs en tiempo de peticion funciona en `next build`
// (Node, con los archivos en disco) pero revienta en el Worker de Cloudflare,
// donde en tiempo de peticion solo existe el bundle:
//
//   Error: no such file or directory, readAll '/bundle/app/icon.svg'
//
// Asi que el logo se incrusta en el codigo como data URI en tiempo de build.
// Se usa el SVG (no un PNG) a proposito: pesa poco en base64/utf8 y es
// vectorial (nitido a cualquier tamaño). La fuente de verdad sigue siendo el
// icono del sitio (app/icon.svg), no una copia pegada a mano: si
// `disaster-brand` reemplaza el icono, la tarjeta social le sigue en el
// siguiente build.
//
// Mismo patron que scripts/sync-deployment-config.mjs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "app", "icon.svg");
const destDir = join(here, "..", "lib", "generated");
const dest = join(destDir, "brand-logo.ts");

const raw = readFileSync(src, "utf8");

// satori (el motor de next/og) rasteriza el SVG con resvg. No damos por
// supuesto que resuelva <style> + class: si el SVG declara clases con fill
// (patrón común en exports de herramientas de diseño), las resolvemos a
// atributos `fill` y borramos el bloque <defs><style>. El icono placeholder
// del template usa fills planos y no tiene <style>, así que este paso es un
// no-op para él — pero un SVG de marca real que SÍ use clases sigue
// funcionando sin tocar este script.
const classFills = new Map();
for (const [, cls, fill] of raw.matchAll(
  /\.([\w-]+)\s*\{\s*fill:\s*(#[0-9a-fA-F]{3,8})\s*;?\s*\}/g,
)) {
  classFills.set(cls, fill);
}

let svg = raw
  // Cabecera XML y bloque de estilos: sobran una vez inlineados los fills.
  .replace(/<\?xml[^>]*\?>/g, "")
  .replace(/<defs>[\s\S]*?<\/defs>/g, "")
  .replace(/class="([\w-]+)"/g, (_match, cls) => {
    const fill = classFills.get(cls);
    if (!fill) {
      throw new Error(
        `[generate-brand-logo] clase "${cls}" sin fill declarado en ${src}. ` +
          `Si el SVG usa clases CSS, deben venir de un bloque <style> con la forma ".clase { fill: #rrggbb; }".`,
      );
    }
    return `fill="${fill}"`;
  })
  // Colapsar espacio en blanco: el data URI viaja en el bundle del Worker.
  .replace(/>\s+</g, "><")
  .trim();

// Comprobacion de humo: si quedan clases sin resolver, el logo saldria negro.
if (svg.includes("class=")) {
  throw new Error(
    `[generate-brand-logo] quedaron atributos class= sin resolver en el SVG.`,
  );
}

const viewBox = svg.match(/viewBox="([\d.\s-]+)"/);
if (!viewBox) {
  throw new Error(`[generate-brand-logo] el SVG no declara viewBox.`);
}
const [, , vbW, vbH] = viewBox[1].trim().split(/\s+/).map(Number);

// `utf8` en vez de base64: pesa menos y el diff del fichero generado sigue
// siendo legible cuando alguien lo inspecciona.
const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const out = `// GENERADO por scripts/generate-brand-logo.mjs — no editar a mano.
// Fuente: app/icon.svg
//
// Se incrusta el logo como data URI porque el Worker de Cloudflare no tiene
// los archivos del proyecto en disco en tiempo de peticion. Ver el script
// para el contexto. CHANGE_ME: si \`disaster-brand\` reemplaza app/icon.svg
// por el logo real del deployment, vuelve a correr \`npm run codegen\` (o
// \`node scripts/generate-brand-logo.mjs\`) para regenerar este archivo.

/** Icono del sitio como data URI SVG, listo para <img src>. */
export const BRAND_LOGO_DATA_URI =
  ${JSON.stringify(dataUri)};

/** Relacion de aspecto intrinseca del logo (ancho / alto). */
export const BRAND_LOGO_ASPECT = ${(vbW / vbH).toFixed(4)};
`;

mkdirSync(destDir, { recursive: true });
writeFileSync(dest, out, "utf8");
console.log(
  `[generate-brand-logo] ${src} -> ${dest} (${(dataUri.length / 1024).toFixed(1)} KiB data URI)`,
);
