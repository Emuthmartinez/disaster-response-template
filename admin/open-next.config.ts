import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Adaptador de Next.js -> Cloudflare Workers para el panel admin.
//
// Config mínima, igual que frontend/open-next.config.ts: sin cache
// incremental. El panel es todo tráfico autenticado y dinámico; las páginas
// estáticas (login, shell) salen como assets y los BFF corren en el Worker.
export default defineCloudflareConfig();
