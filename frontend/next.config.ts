import path from "node:path";
import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las rutas.
//
// Las de abajo (sin CSP) son hardening sin riesgo de romper la app:
//   - nosniff: evita MIME-sniffing (defensa ante respuestas servidas como tipo
//     equivocado).
//   - X-Frame-Options + frame-ancestors: anti-clickjacking (la app no se embebe
//     en iframes de terceros).
//   - Referrer-Policy: no filtrar la URL completa a destinos cross-origin.
//   - Permissions-Policy: apaga APIs potentes que la app no usa.
//   - HSTS: fuerza HTTPS en navegadores que ya visitaron el sitio.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "microphone=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

// Origen del backend (NEXT_PUBLIC_API_URL) para inyectarlo en la CSP. En prod es
// típicamente https://api.<dominio> (ya cubierto por `https:`),
// pero en dev es http://localhost:8080: NO lo cubre `'self'` (:3000) ni `https:`
// (es http), así que sin esto el navegador BLOQUEA las fotos (`<img>` cross-origin)
// y los fetch del cliente en local. Derivarlo del env lo hace válido en todo entorno.
function envOrigin(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
const API_ORIGIN = envOrigin("NEXT_PUBLIC_API_URL");
// Origen del CDN R2 de fotos (NEXT_PUBLIC_R2_PUBLIC_BASE, p.ej.
// https://cdn.example.org). Las fotos migradas a R2 hacen
// que el endpoint del backend REDIRIJA (302) a este CDN. Un `<img>` cargado
// directo sigue el redirect bajo `img-src` (`https:`, permisivo). PERO el service
// worker intercepta la foto y hace `fetch()`, gobernado por `connect-src`: si el
// CDN no está listado ahí, el SW no puede seguir el redirect y lanza
// "Refused to connect (CSP)" en cacheFirst → la foto NO se ve. Por eso el CDN R2
// debe ir en connect-src (y en img-src por si el `<img>` lo carga directo).
const R2_ORIGIN = envOrigin("NEXT_PUBLIC_R2_PUBLIC_BASE");
// Orígenes de media (foto) a añadir a img-src/connect-src, sin vacíos ni duplicados.
const MEDIA_ORIGINS = Array.from(
  new Set([API_ORIGIN, R2_ORIGIN].filter((o): o is string => Boolean(o))),
);
const MEDIA_SRC = MEDIA_ORIGINS.length ? ` ${MEDIA_ORIGINS.join(" ")}` : "";
// Wildcard opcional para cubrir subdominios del propio apex (p.ej. otro
// servicio bajo el mismo dominio que no pasa por NEXT_PUBLIC_API_URL). Se lee
// de env — sin configurar, no se añade nada (API_ORIGIN ya cubre el backend).
const SITE_APEX_DOMAIN = process.env.NEXT_PUBLIC_SITE_APEX_DOMAIN?.trim();
const SITE_APEX_SRC = SITE_APEX_DOMAIN ? ` https://*.${SITE_APEX_DOMAIN}` : "";

// CSP en modo ENFORCING (bloquea, no solo reporta). La política ya lista los
// orígenes de terceros que la app usa de verdad: Google Analytics/Tag Manager,
// Google Translate, Cloudflare Turnstile, Google Fonts, y la API propia
// (derivada de NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SITE_APEX_DOMAIN) por
// connect-src. `img-src https:` se mantiene amplio a propósito por los tiles
// de OpenStreetMap y los redirects de foto a orígenes externos de las
// fuentes de sync.
//
// NOTA operativa: `script-src`/`style-src` conservan `'unsafe-inline'` porque
// Next inyecta scripts/estilos inline. Endurecer eso a nonces es un cambio mayor
// aparte; esta política ya corta la mayoría de vectores (object-src 'none',
// base-uri 'self', frame-ancestors 'self', form-action 'self'). Si tras
// desplegar algo legítimo se rompe, la violación sale en consola con el origen
// exacto: añádelo aquí. Para volver a solo-reporte, cambia la key de la cabecera
// a `Content-Security-Policy-Report-Only` en headers().
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  // script-src: GA (gaId G-… en app/layout.tsx), Google Translate, y Cloudflare
  // Turnstile (useTurnstile.tsx carga challenges.cloudflare.com/turnstile/v0). El
  // script de OpenPanel se sirve por NUESTRO backend (/api/op/op1.js), así que
  // entra por `connect-src` al API, no por un origen de openpanel.dev.
  // Google Translate encadena: element.js (translate.google.com) → runtime y CSS
  // (www.gstatic.com y translate.googleapis.com) → idiomas soportados por JSONP
  // (translate-pa.googleapis.com como <script>, por eso va aquí ADEMÁS de en
  // connect-src para el XHR de traducción). Si falta CUALQUIERA de esos
  // orígenes el widget no inicializa y la página no se traduce.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://translate.googleapis.com https://www.gstatic.com",
  // MEDIA_SRC = API + CDN R2. API_ORIGIN cubre el backend en http (dev:
  // http://localhost:8080), que `https:` no matchea. En prod son https y ya
  // estarían cubiertos por `https:`; añadirlos es inocuo y explícito.
  `img-src 'self' data: blob: https:${MEDIA_SRC}`,
  "font-src 'self' data: https://fonts.gstatic.com",
  // connect-src: GA, y la API propia — el navegador habla con el backend por
  // NEXT_PUBLIC_API_URL (no same-origin tras el split web/api), incluido el
  // proxy de OpenPanel /api/op. NEXT_PUBLIC_SITE_APEX_DOMAIN (opcional) cubre
  // otros subdominios del propio apex si el deployment los usa. Nominatim lo
  // llama el backend, no el navegador, pero se deja por si algún fetch
  // directo aparece. Google Translate traduce el DOM con XHR a
  // translate.googleapis.com y translate-pa.googleapis.com: sin estos
  // orígenes el widget carga pero el texto nunca se traduce.
  // a/b/c.tile.openstreetmap.org: subdominios explícitos de Leaflet {s}; el
  // wildcard *.tile a veces no aplica al fetch() del service worker en todos
  // los navegadores. tile.openstreetmap.org: fallback sin subdominio.
  `connect-src 'self'${MEDIA_SRC}${SITE_APEX_SRC} https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://nominatim.openstreetmap.org https://tile.openstreetmap.org https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://*.tile.openstreetmap.org https://api.rainviewer.com https://translate.googleapis.com https://translate-pa.googleapis.com https://translate.google.com`,
  // frame-src: Translate y Turnstile.
  "frame-src 'self' https://translate.google.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // `output: "standalone"` empaqueta solo lo necesario (incluido un server.js
  // mínimo) en `.next/standalone`, para correr en Docker sin instalar todo
  // node_modules. Necesario para el despliegue en Hetzner/k3s (ver Dockerfile
  // + infra/). En Vercel es inocuo. `public` y `.next/static` se copian a mano
  // en el Dockerfile, tal como indican los docs de Next.
  output: "standalone",
  // Tree-shaking de barrels: importa solo los iconos usados de lucide-react en
  // vez del módulo completo. Next 16 ya lo hace por defecto para lucide; queda
  // explícito por si cambia el default o se suman más libs de barril.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Fija la raíz del workspace al root del monorepo (padre de frontend/), NO a
  // este directorio: sin esto Turbopack infiere la raíz por lockfiles en
  // carpetas superiores (p. ej. un pnpm-lock.yaml en el home) — pero fijarla al
  // propio `frontend/` bloquea la resolución de `../../config/deployment.
  // config.json` (fuera de este paquete, a propósito: un solo archivo de
  // config compartido por frontend/backend/admin).
  turbopack: {
    root: path.join(import.meta.dirname, ".."),
  },
  // Cabeceras de seguridad para toda la app (ver constantes arriba).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
  // Protección anti version-skew para el roll multi-pod en Hetzner. `next build`
  // estampa un build-id ALEATORIO por defecto, así que los 2 pods de un mismo
  // deploy servirían URLs `/_next/static/<id>/…` distintas — un usuario en el pod
  // A podría pedir un chunk que solo tiene el pod B → 404 → ChunkLoadError (no hay
  // sticky sessions en el LB). Derivar el id del commit SHA hace que ambos pods
  // coincidan; `deploymentId` fuerza una navegación dura (recarga limpia) cuando
  // una pestaña vieja pega contra un pod nuevo entre deploys. APP_BUILD_SHA se lee
  // en BUILD time (build-arg → ENV en el Dockerfile); cae a "dev" en local.
  generateBuildId: async () => process.env.APP_BUILD_SHA || "dev",
  deploymentId: process.env.APP_BUILD_SHA || undefined,
  // Sirve /_next/static desde el CDN (R2 + dominio Cloudflare) para que una
  // petición de chunk nunca pegue a un pod mid-deploy con otro build — el CDN
  // tiene los assets inmutables y content-hashed de TODOS los builds, así siempre
  // resuelve. Fix estructural del 404/"Loading…" en la ventana de deploy. Se fija
  // en BUILD time (build-arg → env). Sin setear (local/dev, o antes de tener CDN)
  // → sin prefijo, los assets los sirve la app igual que antes.
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX
    ? process.env.NEXT_PUBLIC_ASSET_PREFIX.replace(/\/$/, "")
    : undefined,
  // NOTA: ya NO hay proxy de /api. El frontend llama al backend por su URL
  // ABSOLUTA (NEXT_PUBLIC_API_URL, ver lib/api.ts) — son servicios separados
  // (tier web vs tier api). El backend habilita CORS para el origen del front.
};

export default nextConfig;
