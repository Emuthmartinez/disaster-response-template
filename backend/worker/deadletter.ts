/**
 * Dead-letter queue (DLQ) + alerta de tasa de fallos.
 *
 * BullMQ ya retiene los jobs fallidos en su set `failed` (acotado por
 * removeOnFail), pero eso (a) caduca por conteo y (b) no es fácil de inspeccionar
 * ni re-encolar. Aquí, cuando un job AGOTA sus reintentos, empujamos un registro
 * compacto a una lista Redis `mapa:dlq` (capada) para inspección/replay, y
 * llevamos un contador de fallos por ventana para alertar.
 *
 * No reemplaza la recuperación por rescan (photo_migrated_at IS NULL / reconcile);
 * es OBSERVABILIDAD encima — el operador puede ver QUÉ registros fallaron sin
 * raspar logs. Patrón estándar "crisis-grade": DLQ + alerting.
 */
import type { Job } from "bullmq";
import { getRedis } from "./redis";

const DLQ_KEY = process.env.DLQ_KEY || "mapa:dlq";
const DLQ_MAX = Number(process.env.DLQ_MAX || 5000);
const FAIL_RATE_KEY = process.env.DLQ_FAIL_RATE_KEY || "mapa:dlq:rate";
const FAIL_RATE_WINDOW_S = Number(process.env.DLQ_FAIL_RATE_WINDOW_S || 300);
const FAIL_RATE_ALERT = Number(process.env.DLQ_FAIL_RATE_ALERT || 50);

export interface DeadLetter {
  queue: string;
  jobId: string | undefined;
  name: string;
  data: unknown;
  reason: string;
  attemptsMade: number;
  failedAt: number;
}

/** ¿El job agotó todos sus reintentos? (último intento fallido). */
export function isExhausted(job: Job | undefined): boolean {
  if (!job) return false;
  const max = job.opts?.attempts ?? 1;
  return job.attemptsMade >= max;
}

/**
 * Registra un job muerto en el DLQ y actualiza el contador de tasa de fallos.
 * Best-effort: si Redis falla, logueamos y seguimos (no queremos que el handler
 * de `failed` lance). Llamar SOLO cuando isExhausted(job) es true.
 */
export async function recordDeadLetter(
  queue: string,
  job: Job | undefined,
  err: Error | undefined,
  now: number,
): Promise<void> {
  const entry: DeadLetter = {
    queue,
    jobId: job?.id,
    name: job?.name ?? "unknown",
    data: job?.data,
    reason: (err?.message || String(err) || "unknown").slice(0, 512),
    attemptsMade: job?.attemptsMade ?? 0,
    failedAt: now,
  };
  try {
    const redis = getRedis();
    // LPUSH + LTRIM = lista capada (los más nuevos al frente, viejos se caen).
    await redis.lpush(DLQ_KEY, JSON.stringify(entry));
    await redis.ltrim(DLQ_KEY, 0, DLQ_MAX - 1);
    // Contador de fallos por ventana: INCR + EXPIRE en la primera escritura.
    const n = await redis.incr(FAIL_RATE_KEY);
    if (n === 1) await redis.expire(FAIL_RATE_KEY, FAIL_RATE_WINDOW_S);
    if (n === FAIL_RATE_ALERT) {
      console.error(
        `[dlq] ALERTA: ${n} jobs muertos en los últimos ${FAIL_RATE_WINDOW_S}s ` +
          `(último: ${queue}/${entry.jobId} — ${entry.reason})`,
      );
    }
  } catch (e) {
    console.error(
      `[dlq] no se pudo registrar job muerto ${queue}/${entry.jobId}:`,
      e instanceof Error ? e.message : e,
    );
  }
}
