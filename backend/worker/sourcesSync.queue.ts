/**
 * Cola dedicada para la sincronización de fuentes externas (desaparecidos).
 *
 * Patrón estándar (ver email.queue.ts): UN módulo por cola con AMBOS lados —
 * `enqueueSourceSync()`/`getSyncJobState()` (productor, que usa el app desde el
 * request path) y `createSourcesSyncWorker()` (consumidor, que arranca el proceso
 * worker). El módulo se mantiene LIGERO (solo bullmq + el cliente redis
 * compartido); la lógica pesada (runSyncChunked, pg, fetch de feeds) se importa
 * de forma perezosa DENTRO del processor, así el bundle del app no la arrastra.
 *
 * Reemplaza el sync inline de /api/sync/run y /api/sync/cron, que bloqueaban el
 * request path hasta 300s (audit M-2). Ahora el endpoint encola y devuelve 202;
 * el worker procesa con el motor chunked+checkpointed ya existente.
 *
 * Requiere VALKEY_URL (ya está en app-env, que cargan tanto el app como el
 * worker). jobId determinístico por (fuente, modo) → re-disparo idempotente.
 */
import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";

const PREFIX = process.env.QUEUE_PREFIX || "mapa";
export const SOURCES_SYNC_QUEUE = "sources-sync";

const REMOVE_ON_COMPLETE = Number(process.env.QUEUE_REMOVE_ON_COMPLETE || 1000);
const REMOVE_ON_FAIL = Number(process.env.QUEUE_REMOVE_ON_FAIL || 5000);

// Cadencia del scheduler incremental (Celery-Beat-equivalente). Por defecto cada
// 10 min, igual que el cron de Vercel que reemplaza.
const SYNC_EVERY_MS = Number(process.env.SYNC_EVERY_MS || 10 * 60_000);

export type SyncMode = "chunk" | "full";

export interface SyncJobData {
  sourceId: string;
  mode: SyncMode;
  dryRun?: boolean;
  limit?: number;
  pagesPerRun?: number;
  statusFilter?: "found" | "missing";
}

let _queue: Queue | null = null;
function queue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(SOURCES_SYNC_QUEUE, {
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
 * Encola un sync para UNA fuente. jobId determinístico por (fuente, modo) → un
 * re-disparo mientras hay uno pendiente es no-op (BullMQ ignora ids existentes).
 * Devuelve el jobId para el status-poll. `-` no `:` (BullMQ prohíbe `:`).
 */
export async function enqueueSourceSync(
  data: SyncJobData,
  opts?: JobsOptions,
): Promise<string> {
  const jobId = `sync-${data.mode}-${data.sourceId}`;
  const q = queue();
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active") {
      await existing.moveToFailed(new Error("superseded by manual re-enqueue"), "0").catch(() => {});
    }
    await existing.remove().catch(() => {});
  }
  const job = await q.add(data.sourceId, data, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
    ...opts,
  });
  return job.id!;
}

/** Estado + resultado de un job, para el status-poll admin. null si no existe. */
export async function getSyncJobState(jobId: string): Promise<{
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
 * Registra el scheduler repetible (Celery-Beat-equivalente): un job incremental
 * por fuente habilitada, cada SYNC_EVERY_MS. Idempotente (upsert en cada arranque
 * del worker). Reemplaza el cron de Vercel.
 */
export async function registerSourceSchedulers(): Promise<void> {
  const { enabledSources } = await import("./sync/sources");
  const q = queue();
  const sources = enabledSources();
  for (const s of sources) {
    await q.upsertJobScheduler(
      `sync-incremental-${s.id}`,
      { every: SYNC_EVERY_MS },
      { name: s.id, data: { sourceId: s.id, mode: "chunk" satisfies SyncMode } },
    );
  }
  console.log(
    `[sources-sync] schedulers registrados: cada ${SYNC_EVERY_MS}ms x ${sources.length} fuentes`,
  );
}

// --------------------------------------------------------------------------
// Consumidor (lado worker) — la lógica pesada se importa de forma perezosa.
// --------------------------------------------------------------------------

const processor: Processor = async (job) => {
  const { sourceId, mode, dryRun, limit, pagesPerRun, statusFilter } =
    job.data as SyncJobData;
  // Lazy import: mantiene el módulo de cola ligero para el bundle del app.
  const { runSync, runSyncChunked } = await import("./sync/engine");
  const { getSource } = await import("./sync/sources");
  const { recordSyncRun } = await import("./sync/state");

  const adapter = getSource(sourceId);
  if (!adapter) throw new Error(`Fuente desconocida: ${sourceId}`);

  // El modo chunked necesita `fetchPage` (paginación por página). Las fuentes
  // que paginan por cursor (y no implementan `fetchPage`) caen a la corrida
  // completa, que camina el cursor internamente.
  const result =
    mode === "chunk" && adapter.fetchPage
      ? await runSyncChunked(adapter, { pagesPerRun, statusFilter })
      : await runSync(adapter, { dryRun, limit, statusFilter });

  // Persistimos la corrida (salvo dry-run) igual que hacía runAllSources.
  if (!result.dryRun) await recordSyncRun(result, "cron");
  return result;
};

export function createSourcesSyncWorker(): Worker {
  const concurrency = Number(process.env.SOURCES_SYNC_CONCURRENCY || 2);
  // lockDuration > job más largo (sync chunked ~200s) para que BullMQ no lo marque
  // "stalled" y lo re-ejecute en paralelo (equivalente al visibility_timeout).
  const lockDuration = Number(process.env.LONG_JOB_LOCK_MS || 300_000);
  return new Worker(SOURCES_SYNC_QUEUE, processor, {
    connection: getRedis(),
    prefix: PREFIX,
    concurrency,
    lockDuration,
  });
}
