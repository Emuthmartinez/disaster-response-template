/**
 * Service worker mínimo y prudente para esta plataforma de emergencia.
 *
 * Estrategia:
 *  - HTML/navegaciones: network-first con fallback al último HTML cacheado o
 *    a una página simple offline. Nunca devolvemos contenido viejo si la red
 *    está disponible, porque los reportes cambian rápido.
 *  - Imágenes de reportes/desaparecidos (/api/.../photo): cache-first.
 *  - Tiles de OpenStreetMap: NO interceptados — Leaflet los carga como <img>
 *    (img-src https:). Interceptarlos con fetch() en el SW choca con connect-src
 *    y deja el mapa gris en navegadores con SW registrado.
 *  - Otros assets estáticos del propio dominio (_next/static, /icon-192.png,
 *    manifest, etc.): cache-first.
 *  - APIs JSON (/api/...): siempre network; si falla, devolvemos lo último
 *    cacheado por GET. No interceptamos POST/DELETE.
 *
 * Hosts cross-origin de la API:
 *  El backend vive en api.<dominio> (api-staging.<dominio> en despliegues con
 *  entorno de staging; ver middleware.ts y NEXT_PUBLIC_API_URL). El SW
 *  intercepta las peticiones GET al host API igual que a las same-origin
 *  `/api/...` (necesario para mantener network-first con fallback offline).
 *  Las respuestas vienen con CORS habilitado, así que la Cache API las puede
 *  guardar sin restricciones de "opaque response".
 */

const CACHE_VERSION = "v7";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const PHOTO_CACHE = `photos-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const HTML_CACHE = `html-${CACHE_VERSION}`;

const KEEP_CACHES = new Set([
  STATIC_CACHE,
  PHOTO_CACHE,
  API_CACHE,
  HTML_CACHE,
]);

const CORE_ASSETS = [
  "/icon.svg",
  "/favicon.ico",
  "/favicon-32.png",
  "/favicon-64.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];
const CORE_PAGES = ["/", "/privacidad"];
// El precache de snapshots `/api/...` se eliminó al mover el backend a
// `api.<dominio>` (cross-origin): `cache.addAll` con una URL cross-origin sin
// CORS configurado falla y aborta el install. El `networkFirst` posterior se
// encarga de poblar el API cache con la primera respuesta real desde la app.
// Página de último recurso: se muestra solo si ni siquiera hay un "/" cacheado
// (caché fría o desalojada). Lleva embebidos los teléfonos de emergencia
// universales para que SIEMPRE haya números a la mano sin conexión.
// Mantener sincronizado con el grupo "Emergencias (línea directa)" de
// app/components/EmergencyContacts.tsx.
const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Sin conexión</title><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:2rem 1rem;min-height:100vh;box-sizing:border-box}main{max-width:30rem;margin:0 auto;text-align:center}h1{margin:.5rem 0;font-size:1.25rem}p{color:#475569}.lead{max-width:28rem;margin:.5rem auto 1.5rem}.note{margin-top:1.5rem;font-size:.75rem;color:#64748b}</style></head><body><main><h1>🛰️ Sin conexión</h1><p class="lead">No hay internet en este momento. Si tienes una emergencia, contacta a los servicios de emergencia locales de tu país o región.</p><p class="note">Cuando vuelva la conexión podrás ver el mapa, reportar y consultar la lista completa de teléfonos de emergencia.</p></main></body></html>`;
// 8s: 2.5s era demasiado agresivo — abandonaba requests legítimos (un /api/missing
// frío ronda ~450ms pero bajo carga/cold-start podía pasar de 2.5s) y servía cache
// viejo mientras el fetch real seguía. Con el AbortController de fetchWithTimeout,
// un request lento ahora se CANCELA limpio al vencer, sin fugas.
const API_TIMEOUT_MS = 8000;
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {})),
      caches
        .open(HTML_CACHE)
        .then((cache) => cache.addAll(CORE_PAGES).catch(() => {})),
    ])
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => (KEEP_CACHES.has(key) ? null : caches.delete(key))),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPhotoApi(url) {
  return (
    url.pathname.startsWith("/api/missing/") && url.pathname.endsWith("/photo")
  ) || (
    url.pathname.startsWith("/api/reports/") && url.pathname.endsWith("/photo")
  );
}

// Reconoce las peticiones que apuntan a la superficie `/api/...`, sea en el
// mismo origen (dev/legado) o en el subdominio API cross-origin
// (`api.<dominio>` en producción, `api-staging.<dominio>` en staging). Espejo
// a mano de `matchesApiHost()` en lib/api-host.ts (con prefijo fijo "api": un
// service worker no puede importar un módulo TypeScript, así que si cambias
// la regla allá, actualiza también esto). También mantiene un solo criterio
// con `frontend/middleware.ts` de "esto es API".
function isApiRequest(url) {
  if (!url.pathname.startsWith("/api/")) return false;
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) return true;
  // Cross-origin: solo si el host empieza con `api.` o `api-staging.` (puerto
  // incluido). `api-staging.` es hermano de `api.`, no hijo: sin el segundo
  // prefijo, staging nunca ejercitaba estas rutas de intercepción del SW y no
  // probaba lo que producción sí ejecuta.
  return url.host.startsWith("api.") || url.host.startsWith("api-staging.");
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreVary: las respuestas de foto llevan `Vary: Origin` (CORS del backend);
  // sin esto, un match estricto puede fallar según qué cabeceras llevó el request.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    // Re-emitimos el request en modo CORS en vez de reenviarlo tal cual: las
    // fotos se piden desde <img> cross-origin SIN `crossorigin`, y ese request
    // no-cors produce una respuesta OPACA (status 0, ok false) aunque el backend
    // devuelva 200. Gatear cache.put por `ok` con opacas deja el cache de fotos
    // vacío para siempre (el 0 de entradas tras cargar N fotos es la señal) y
    // mata el modo offline de fotos. El backend ya responde con
    // Access-Control-Allow-Origin, así que en modo CORS el status es visible:
    // cacheamos SOLO 200s reales y jamás un error transitorio (una opaca
    // cacheada de un 500 frío sería una foto rota permanente). Same-origin
    // (_next/static, iconos) no cambia: mode cors ahí produce respuestas
    // "basic" normales. Y con timeout, como TODAS las demás estrategias del
    // fichero: un backend frío puede tardar mucho en la primera foto y sin
    // límite el respondWith() queda colgado en vez de degradar.
    const fresh = await fetchWithTimeout(
      new Request(request.url, { mode: "cors" }),
      API_TIMEOUT_MS,
    );
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    // El fetch CORS falló: red caída, timeout, o un origen que no manda ACAO
    // (p.ej. un redirect de foto a un CDN externo). Último intento con el
    // request original no-cors — es lo que hacía siempre este SW: la opaca se
    // devuelve SIN cachear (no podemos ver su status) pero el <img> la pinta.
    try {
      return await fetchWithTimeout(request, API_TIMEOUT_MS);
    } catch {
      // NUNCA propagamos el throw: `respondWith` con una promesa rechazada
      // genera "Uncaught (in promise): Failed to fetch" en consola y deja el
      // recurso en error igual. Devolvemos un 503 normal: el `<img>` queda roto
      // (como sin SW) pero sin ruido ni rechazo suelto.
      return new Response("", { status: 503, statusText: "sw-fetch-failed" });
    }
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetchWithTimeout(request, API_TIMEOUT_MS);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Sin red y sin caché: degradamos con una respuesta JSON sintética en vez de
    // propagar el error. Si hiciéramos `throw`, `event.respondWith()` recibiría una
    // promesa rechazada y el navegador filtraría "FetchEvent.respondWith received an
    // error: …" a la UI. Con un 503 normal, la app ve `!res.ok` y muestra su propio
    // mensaje amable.
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

// AbortController real: al vencer el timeout, CANCELA el fetch — no solo pierde
// la carrera. Sin esto, un Promise.race dejaba el fetch huérfano corriendo en
// segundo plano (respuestas lentas iniciadas por sw.js aun cuando el SW ya
// había devuelto cache): bandwidth desperdiciado y el pool de conexiones
// agotado por requests que nadie consume.
function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // 1. Navegaciones HTML: NETWORK-FIRST. Quien entra con conexión SIEMPRE recibe
  // la versión fresca del servidor — nunca servimos HTML cacheado estando online,
  // así el contenido (reportes, rediseño, deploys) jamás queda "pegado" en cache.
  // El cache de HTML solo se usa como respaldo SIN conexión (app de emergencia:
  // debe abrir aunque no haya red), y como último recurso el HTML offline con los
  // teléfonos de emergencia.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(HTML_CACHE);
        try {
          const fresh = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
          if (fresh.ok) {
            // Refresca el respaldo offline, pero la respuesta servida es la fresca.
            cache.put(request, fresh.clone());
            return fresh;
          }
        } catch {
          // Sin red: caemos al respaldo cacheado abajo.
        }
        const cached = await cache.match(request);
        if (cached) return cached;
        const cachedHome = await cache.match("/");
        if (cachedHome) return cachedHome;
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      })(),
    );
    return;
  }

  // Resto: manejamos same-origin (assets/tiles) y el subdominio API cross-origin.
  const sameOrigin = url.origin === self.location.origin;
  const apiRequest = isApiRequest(url);

  // 2. Fotos de reportes/desaparecidos: cache-first (no cambian).
  if (apiRequest && isPhotoApi(url)) {
    event.respondWith(cacheFirst(request, PHOTO_CACHE));
    return;
  }

  // 3. APIs JSON: network-first con cache de respaldo (incluye el host API
  //    cross-origin, ver `isApiRequest`).
  if (apiRequest) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 4. Assets estáticos de Next y públicos: cache-first.
  if (
    sameOrigin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/icon.svg" ||
      url.pathname === "/favicon.ico" ||
      url.pathname === "/favicon-32.png" ||
      url.pathname === "/favicon-64.png" ||
      url.pathname === "/apple-touch-icon.png" ||
      url.pathname === "/icon-192.png" ||
      url.pathname === "/icon-512.png" ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js"))
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});
