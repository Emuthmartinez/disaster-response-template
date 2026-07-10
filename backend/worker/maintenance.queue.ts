/**
 * Cola de mantenimiento: trabajos de fondo admin/cron que NO deben correr inline
 * en el request path (audit M-2). Mismo patrón que sourcesSync.queue.ts
 * (productor + factory de worker en un módulo ligero; lógica pesada lazy-import).
 *
 * Jobs:
 *   - geocode:   geocodifica ubicaciones pendientes (Nominatim). Antes lo
 *     disparaba un cron de Vercel inline (maxDuration:300). Ahora: scheduler del
 *     worker cada 5 min + endpoint thin que encola. SIN frontend (nadie espera
 *     el resultado; alimenta el mapa vía geocode_cache).
 *   - duplicates: construye el reporte de posibles duplicados (read-only). Lo
 *     pide el admin bajo demanda; el resultado se lee con status-poll
 *     (/api/sync/status reusa getJob por id). Devuelve el reporte en returnvalue.
 */
import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";

const PREFIX = process.env.QUEUE_PREFIX || "mapa";
export const MAINTENANCE_QUEUE = "maintenance";

const REMOVE_ON_COMPLETE = Number(process.env.QUEUE_REMOVE_ON_COMPLETE || 1000);
const REMOVE_ON_FAIL = Number(process.env.QUEUE_REMOVE_ON_FAIL || 5000);

// Cadencia del geocode (reemplaza el cron de Vercel */5). Apagable con SYNC_SCHEDULERS=0.
const GEOCODE_EVERY_MS = Number(process.env.GEOCODE_EVERY_MS || 5 * 60_000);

export type MaintenanceKind = "geocode" | "duplicates";

export interface GeocodeJobData {
  kind: "geocode";
  maxLocations?: number;
}
export interface DuplicatesJobData {
  kind: "duplicates";
  source?: string;
  limitGroups?: number;
}
export type MaintenanceJobData = GeocodeJobData | DuplicatesJobData;

let _queue: Queue | null = null;
function queue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(MAINTENANCE_QUEUE, {
    connection: getRedis(),
    prefix: PREFIX,
    streams: { events: { maxLen: 1000 } },
  });
  return _queue;
}

// --------------------------------------------------------------------------
// Productor (lado app)
// --------------------------------------------------------------------------

/**
 * Encola el geocode. jobId fijo → un re-trigger mientras hay uno pendiente es
 * no-op (no se apila; igual que el scheduler). Devuelve el jobId.
 */
export async function enqueueGeocode(
  maxLocations?: number,
  opts?: JobsOptions,
): Promise<string> {
  const job = await queue().add(
    "geocode",
    { kind: "geocode", maxLocations } satisfies GeocodeJobData,
    {
      jobId: "maint-geocode",
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
  return job.id!;
}

/**
 * Encola un reporte de duplicados. jobId por (source, limitGroups) para que dos
 * peticiones idénticas concurrentes compartan el job; el admin lee el resultado
 * por status-poll. Devuelve el jobId.
 */
export async function enqueueDuplicatesReport(
  source: string | undefined,
  limitGroups: number | undefined,
  opts?: JobsOptions,
): Promise<string> {
  const job = await queue().add(
    "duplicates",
    { kind: "duplicates", source, limitGroups } satisfies DuplicatesJobData,
    {
      jobId: `maint-dups-${source ?? "default"}-${limitGroups ?? "def"}`,
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
  return job.id!;
}

/** Estado + resultado de un job de mantenimiento (status-poll). null si no existe. */
export async function getMaintenanceJobState(jobId: string): Promise<{
  jobId: string;
  state: string;
  progress: unknown;
  result: unknown;
  failedReason: string | null;
} | null> {
  const job = await queue().getJob(jobId);
  if (!job) return null;
  return {
    jobId,
    state: await job.getState(),
    progress: job.progress,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  };
}

/**
 * Scheduler del geocode (Celery-Beat-equivalente): cada GEOCODE_EVERY_MS.
 * Idempotente (upsert). Reemplaza el cron de Vercel de cada 5 min.
 */
export async function registerMaintenanceSchedulers(): Promise<void> {
  const q = queue();
  await q.upsertJobScheduler(
    "maint-geocode-incremental",
    { every: GEOCODE_EVERY_MS },
    { name: "geocode", data: { kind: "geocode" } satisfies GeocodeJobData },
  );
  console.log(`[maintenance] scheduler geocode cada ${GEOCODE_EVERY_MS}ms`);
}

// --------------------------------------------------------------------------
// Consumidor (lado worker) — lógica pesada lazy-import.
// --------------------------------------------------------------------------

const processor: Processor = async (job) => {
  const data = job.data as MaintenanceJobData;
  if (data.kind === "geocode") {
    const { runGeocode } = await import("./sync/geocode");
    return runGeocode({ maxLocations: data.maxLocations });
  }
  if (data.kind === "duplicates") {
    const { buildDuplicateReport } = await import("./sync/dedup");
    return buildDuplicateReport({
      source: data.source,
      limitGroups: data.limitGroups,
    });
  }
  throw new Error(`Maintenance kind desconocido: ${(data as { kind: string }).kind}`);
};

export function createMaintenanceWorker(): Worker {
  const concurrency = Number(process.env.MAINTENANCE_CONCURRENCY || 2);
  // geocode/duplicates pueden tardar (~60-300s); lock > job más largo para que no
  // se marquen "stalled" y se re-ejecuten en paralelo.
  const lockDuration = Number(process.env.LONG_JOB_LOCK_MS || 300_000);
  return new Worker(MAINTENANCE_QUEUE, processor, {
    connection: getRedis(),
    prefix: PREFIX,
    concurrency,
    lockDuration,
  });
}
