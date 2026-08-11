/**
 * Cache de borde para las fotos públicas, DENTRO del Worker de la API.
 *
 * Las cache rules de zona no aplican aquí: la API es un Worker con custom
 * domain y el Worker corre ANTES de la fase de cache del CDN (verificado en
 * vivo: ninguna regla produce cf-cache-status en api.*). El camino de una foto
 * fría es el más caro del origen (Worker → Neon/R2, 28s medidos), así que el
 * propio Worker consulta caches.default antes de entrar a Express.
 *
 * Solo se cachean 200s: un 500 de arranque frío o un 404 transitorio no deben
 * quedar clavados. El TTL lo gobierna el Cache-Control que ya emite
 * setPublicPhotoHeaders() (immutable, 1 año) — cache.put lo respeta. La clave
 * es un GET desnudo de la URL (sin cabeceras): las respuestas de foto son
 * uniformes (ACAO *, sin Vary), así que la URL identifica los bytes, y un
 * request con Range u otras cabeceras no fragmenta ni rompe el put.
 */

/** Subconjunto estructural de la Cache API de Workers (para no depender de lib DOM). */
export interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<unknown>;
}

// Espejo de los cinco endpoints de foto: missing/pets (photo y
// resolution-photo) y reports (photo). Cualquier endpoint de foto nuevo debe
// servir cabeceras uniformes (setPublicPhotoHeaders) antes de añadirse aquí.
const PHOTO_PATH_RE =
  /^\/api\/(?:missing|pets)\/[^/]+\/(?:photo|resolution-photo)$|^\/api\/reports\/[^/]+\/photo$/;

export function isCacheablePhotoPath(pathname: string): boolean {
  return PHOTO_PATH_RE.test(pathname);
}

/**
 * Sirve una foto con cache-first sobre `cache`. `fetchOrigin` es el handler
 * real (Express); `waitUntil` prolonga la vida del isolate mientras el put
 * termina en segundo plano. La cabecera x-photo-edge-cache permite verificar
 * hit/miss desde fuera sin adivinar por timing.
 */
export async function servePhotoCached(opts: {
  url: string;
  cache: EdgeCache;
  fetchOrigin: () => Promise<Response>;
  waitUntil: (p: Promise<unknown>) => void;
}): Promise<Response> {
  const key = new Request(opts.url, { method: "GET" });
  const cached = await opts.cache.match(key);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("x-photo-edge-cache", "hit");
    return res;
  }
  const fresh = await opts.fetchOrigin();
  if (fresh.status === 200) {
    opts.waitUntil(opts.cache.put(key, fresh.clone()));
  }
  const res = new Response(fresh.body, fresh);
  res.headers.set("x-photo-edge-cache", "miss");
  return res;
}
