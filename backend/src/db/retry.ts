/**
 * ============================================================================
 * Reintento de fallos TRANSITORIOS de Neon (solo aplica al driver HTTP).
 * ============================================================================
 *
 * POR QUE EXISTE: en un despliegue de referencia sobre Cloudflare Workers, los
 * logs de observabilidad del Worker registraron una racha de decenas de errores
 * en segundos en la que fallaron A LA VEZ todos los endpoints públicos que
 * tocan la base (listados, mapas, stats, hospitales, reportes, geocodificación
 * e incluso /api/readyz). Todas las trazas mueren en
 * NeonHttpPreparedQuery.queryWithCache. No había UN SOLO reintento en la capa
 * de datos, así que un parpadeo de Neon se convertía directamente en un 500
 * para alguien que estaba buscando a un familiar.
 *
 * POLÍTICA (asimétrica a propósito, no es paranoia gratuita):
 *
 *  - **5xx CON RESPUESTA del proxy de Neon -> se reintenta SIEMPRE.** Que el
 *    proxy conteste 5xx significa que no pudo enrutar hacia el compute: la
 *    sentencia NO llegó a ejecutarse. Reintentar es seguro hasta para escrituras.
 *  - **`fetch` que LANZA (red) -> se reintenta SOLO si la sentencia es de
 *    lectura demostrable.** Aquí no hubo respuesta, así que es imposible saber
 *    si la sentencia se ejecutó antes de perderse. Repetir a ciegas un INSERT en
 *    un registro de personas desaparecidas es peor que devolver un error.
 *
 * UN SOLO reintento (2 intentos), no dos. El cliente ya reintenta hasta 3 veces
 * ante un 5xx (query client del frontend), así que 2 aquí darían hasta 6 golpes
 * end-to-end contra un proxy que ya está sufriendo; con 3 serían 9. Acotar la
 * amplificación importa más que exprimir el último reintento.
 *
 * No afecta a /api/readyz: su `Promise.race` acota el tiempo total, así que el
 * reintento nunca puede hacer que el health check mienta sobre la liveness —
 * como mucho agota su presupuesto y responde 503.
 *
 * Vive en su propio módulo (y no dentro de db/index.ts) para poder testear la
 * política sin arrastrar el driver, el esquema ni config/env.
 */

/** Espera entre el intento fallido y el reintento. */
export const RETRY_BACKOFF_MS = 150;

/**
 * Palabras que descartan una sentencia como "solo lectura". Se busca en TODA la
 * sentencia, no solo al principio: así un CTE `WITH ... INSERT ...` no cuela.
 */
const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|truncate|create|drop|alter|grant|revoke|copy)\b/i;

/**
 * ¿La sentencia es de solo lectura DEMOSTRABLE?
 *
 * Allowlist estricta: ante la menor duda devuelve false. Un falso negativo solo
 * cuesta un reintento que no se hace; un falso positivo puede duplicar una
 * escritura sobre el registro de personas desaparecidas.
 *
 * El cuerpo que manda el driver HTTP de Neon es JSON `{ query, params }`, así
 * que esto NO es un regex sobre texto arbitrario: se parsea el JSON y se mira la
 * sentencia. Aun así se exige que empiece por SELECT *y* que no aparezca ninguna
 * palabra de escritura.
 */
export function isProvablyReadOnly(body: unknown): boolean {
  if (typeof body !== "string") return false;
  let query: unknown;
  try {
    query = (JSON.parse(body) as { query?: unknown }).query;
  } catch {
    return false;
  }
  if (typeof query !== "string") return false;
  const sql = query.trim().toLowerCase();
  if (!sql.startsWith("select")) return false;
  return !WRITE_KEYWORDS.test(sql);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Los tipos se derivan del `fetch` global: el tsconfig del backend es de Node y
// no trae los tipos DOM, así que nombrar `RequestInfo` a pelo no compila.
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

/**
 * `fetch` con un reintento acotado para fallos transitorios de Neon. Se instala
 * como `neonConfig.fetchFunction` (ver db/index.ts).
 *
 * `doFetch` se inyecta solo para los tests; en producción es el `fetch` global.
 */
export async function retryingFetch(
  input: FetchInput,
  init?: FetchInit,
  doFetch: typeof fetch = fetch,
): Promise<Response> {
  // Se calcula UNA vez: el body no cambia entre intentos.
  const retryOnThrow = isProvablyReadOnly(init?.body);
  try {
    const res = await doFetch(input, init);
    // 5xx del proxy: la sentencia no se ejecutó. Seguro reintentar siempre.
    if (res.status >= 500) {
      await sleep(RETRY_BACKOFF_MS);
      return await doFetch(input, init);
    }
    return res;
  } catch (err) {
    // Sin respuesta: no sabemos si la sentencia corrió. Solo lecturas.
    if (!retryOnThrow) throw err;
    await sleep(RETRY_BACKOFF_MS);
    return await doFetch(input, init);
  }
}
