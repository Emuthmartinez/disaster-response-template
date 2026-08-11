import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Adaptador de Next.js -> Cloudflare Workers.
//
// Config mínima a propósito: sin cache incremental (R2/KV) todavía. Las páginas
// estáticas se sirven como assets y las dinámicas se renderizan en el Worker.
// Cuando haya backend y datos reales, valorar `incrementalCache` sobre R2.
export default defineCloudflareConfig();
