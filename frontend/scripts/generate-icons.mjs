// Genera el set completo de iconos raster a partir de app/icon.svg.
//
// Por que existe este paso:
//
// El template solo lleva app/icon.svg (el favicon vectorial de Next.js, vía
// convención de archivo). Un SVG único no es suficiente en la práctica: el
// "añadir a inicio" de iOS, varios launchers de Android y algunos
// crawlers/previews sociales no leen SVG de forma fiable y necesitan un PNG
// en un tamaño concreto. Este script rasteriza el icono UNA vez, a los
// tamaños que layout.tsx y manifest.webmanifest ya declaran.
//
// CUANDO CORRERLO: tras `disaster-brand` (o cualquier otro reemplazo de
// app/icon.svg por el icono real del deployment) — así el set de PNGs sigue
// al icono actual y no queda una versión vieja sirviéndose por accidente.
// No forma parte de `npm run codegen` (prebuild) a propósito: regenerar
// iconos en cada build sería trabajo repetido para un archivo que solo
// cambia cuando alguien reemplaza el icono, no en cada deploy.
//
// Uso: `node scripts/generate-icons.mjs` (o `npm run icons`).
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "app", "icon.svg");
const outDir = join(here, "..", "public");

if (!existsSync(src)) {
  throw new Error(`[generate-icons] no se encontró ${src}.`);
}

mkdirSync(outDir, { recursive: true });

/** @type {Array<{ name: string; size: number }>} */
const PNG_TARGETS = [
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-64.png", size: 64 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

async function renderPng(size) {
  // density alta: rasterizar un SVG pequeño (viewBox 32x32) directo a 512px
  // sin subir la densidad de render deja bordes borrosos. 4x el tamaño
  // objetivo es suficiente margen para cualquier tamaño de esta lista.
  return sharp(src, { density: size * 4 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  const pngs = new Map();
  for (const target of PNG_TARGETS) {
    const buf = await renderPng(target.size);
    pngs.set(target.name, buf);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(outDir, target.name), buf);
    console.log(`[generate-icons] ${src} -> public/${target.name} (${target.size}x${target.size})`);
  }

  // favicon.ico: un único frame de 32x32, empaquetado como PNG-en-ICO (formato
  // ICO moderno; todos los navegadores y sistemas operativos actuales lo
  // aceptan sin necesidad de convertir a BMP crudo). Un solo tamaño en vez de
  // multi-resolución a propósito: mantiene el script simple y sin
  // dependencias extra solo para este archivo — el resto de tamaños ya los
  // cubren favicon-32.png/favicon-64.png/icon-*.png declarados aparte.
  const ico = buildSingleFrameIco(32, pngs.get("favicon-32.png"));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(outDir, "favicon.ico"), ico);
  console.log(`[generate-icons] ${src} -> public/favicon.ico (32x32)`);
}

/**
 * Empaqueta un .ico mínimo válido con UN solo frame PNG embebido. Formato ICO:
 * cabecera (6 bytes) + una entrada de directorio (16 bytes) + los bytes del
 * PNG. Ver la especificación de formato ICO de Microsoft.
 */
function buildSingleFrameIco(size, png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // 1 imagen

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
  dirEntry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  dirEntry.writeUInt8(0, 2); // color palette
  dirEntry.writeUInt8(0, 3); // reserved
  dirEntry.writeUInt16LE(1, 4); // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(png.length, 8); // tamaño de los datos de imagen
  dirEntry.writeUInt32LE(6 + 16, 12); // offset de los datos de imagen

  return Buffer.concat([header, dirEntry, png]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
