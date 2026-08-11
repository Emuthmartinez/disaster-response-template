// Genera public/llms.txt a partir de config/deployment.config.json (raiz del
// repo) — sigue la convencion emergente llms.txt para motores de respuesta
// basados en LLM (resumen del producto, datos clave, paginas principales).
//
// Por que es un CODEGEN y no un fichero estatico: un deployment real de este
// template NO debe heredar contenido de otro despliegue (dominio, contacto,
// nombre de producto/organizacion) por olvidar editar un .txt a mano. Al
// generarlo desde la misma fuente de verdad que el resto del sitio
// (config/deployment.config.json), siempre queda en sincronia.
//
// Mismo patron que scripts/sync-deployment-config.mjs.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, "..", "..", "config", "deployment.config.json");
const outDir = join(here, "..", "public");
const outPath = join(outDir, "llms.txt");

const config = JSON.parse(readFileSync(configPath, "utf8"));
const {
  orgName,
  productName,
  disasterName,
  disasterType,
  regionLabel,
  contactEmail,
  domains,
} = config;

const site = `https://${domains.web}`;

const lines = [
  `# ${productName} · ${orgName}`,
  "",
  `> Mapa y coordinacion ciudadana de emergencia para ${disasterName} (${disasterType}, ${regionLabel}).`,
  "> No es un canal oficial de gobierno. Ante peligro inmediato, contacta el numero de emergencia local.",
  "",
  "## Key facts",
  "",
  `- Product: ${productName} (${orgName} initiative)`,
  `- Canonical site: ${site}`,
  `- Contact: ${contactEmail}`,
  "- Role: citizen reports, missing-person directory, lost pets, hospitals/shelters, collection centers, survival guide",
  `- Disaster: ${disasterName} (${disasterType}), region: ${regionLabel}`,
  "",
  "## Primary pages",
  "",
  `- Home / map: ${site}/`,
  `- Emergency phones: ${site}/telefonos`,
  `- Survival guide: ${site}/guia`,
  `- Hospitals: ${site}/hospitales`,
  `- Lost pets: ${site}/mascotas`,
  `- Collection centers: ${site}/acopio`,
  `- Privacy: ${site}/privacidad`,
  `- Contact: ${site}/contacto`,
  "",
  "## Optional",
  "",
  `- Sitemap: ${site}/sitemap.xml`,
  `- Robots: ${site}/robots.txt`,
  "",
];

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`[generate-llms-txt] ${configPath} -> public/llms.txt`);
