// Copia config/deployment.config.json (raiz del repo) a frontend/config/.
//
// La fuente de verdad es la de la raiz — este fichero solo la trae dentro del
// paquete para que el bundler no tenga que resolver fuera de `frontend/`.
// Ver el comentario en lib/deployment-config.ts.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "config", "deployment.config.json");
const destDir = join(here, "..", "config");
const dest = join(destDir, "deployment.config.json");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-deployment-config] ${src} -> ${dest}`);
