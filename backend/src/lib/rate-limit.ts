import { getRedisSafe } from "@/lib/redis";

/**
 * Rate-limit de ventana deslizante, COMPARTIDO entre todos los pods vía Valkey
 * (sorted-set por identificador). Reemplaza el limitador en-memoria del app
 * previo, que era por-pod (3-30x más laxo con autoscaling) y se reseteaba en
 * cada deploy.
 *
 * Algoritmo (sliding window log, atómico en un solo EVAL):
 *   ZREMRANGEBYSCORE  -> purga marcas fuera de la ventana
 *   ZCARD             -> cuenta las que quedan
 *   si < limit: ZADD (registra esta) + EXPIRE; permite
 *   si >= limit: rechaza
 *
 * Fail-open: si Valkey no está, cae a un limitador en-memoria local (mejor algo
 * que nada; nunca rompe el request).
 */

const SLIDING_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, now .. '-' .. math.random())
redis.call('PEXPIRE', key, window)
return 1
`;

// Fallback en-memoria (solo si Valkey no está disponible).
const memHits = new Map<string, number[]>();

export interface RateLimitOptions {
  /** máximo de peticiones por ventana. */
  limit: number;
  /** ventana en ms (default 60s). */
  windowMs?: number;
}

/**
 * Devuelve true si la petición se permite. `key` debe incluir el scope + la IP,
 * p.ej. `missing:create:<ip>`.
 */
export async function checkRateLimit(
  key: string,
  { limit, windowMs = 60_000 }: RateLimitOptions,
): Promise<boolean> {
  // Bypass SOLO para tests (RATE_LIMIT_DISABLED=1): el suite golpea los mismos
  // endpoints muchas veces desde la misma "IP", lo que dispararía 429 legítimos
  // y haría flaky la matriz. En prod jamás se setea. Es opt-in explícito, no por
  // NODE_ENV, para no relajar nada por accidente.
  if (process.env.RATE_LIMIT_DISABLED === "1") return true;

  const redis = getRedisSafe();
  if (redis) {
    try {
      const now = Date.now();
      const allowed = (await redis.eval(
        SLIDING_LUA,
        1,
        key,
        String(now),
        String(windowMs),
        String(limit),
      )) as number;
      return allowed === 1;
    } catch {
      /* cae al fallback en-memoria */
    }
  }
  // Fallback degradado por-proceso.
  const now = Date.now();
  const hits = (memHits.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (hits.length >= limit) {
    memHits.set(key, hits);
    return false;
  }
  hits.push(now);
  memHits.set(key, hits);
  return true;
}
