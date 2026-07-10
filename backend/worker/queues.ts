/**
 * BullMQ queues + worker factory (standard producer/worker pattern).
 *
 * Two queues:
 *  - migrate-tables: one job per table (Neon -> Hetzner upsert). Low volume.
 *  - migrate-photos: one job per row id (base64/external image -> R2). High
 *    volume (~26k); rate-limited so we don't hammer the external image hosts.
 *
 * Producers and workers both import from here. The worker entrypoint
 * (worker/index.ts) calls createWorkers(); enqueue.ts calls the queue getters.
 */
import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";
import { migrateTable } from "./jobs/migrateTable";
import { migratePhoto, type PhotoTable } from "./jobs/migratePhoto";
import { hubIngest, setImageEnqueuer, type IngestMode } from "./jobs/hubIngest";
import { hubImage } from "./jobs/hubImage";
import { HUB_TYPES, HUB_FEDERATION_ENABLED, assertHubFederationConfigured, type HubType } from "./hub/config";
import { TABLES } from "./tables";
import { recordDeadLetter, isExhausted } from "./deadletter";

const PREFIX = process.env.QUEUE_PREFIX || "mapa";
export const TABLES_QUEUE = "migrate-tables";
export const PHOTOS_QUEUE = "migrate-photos";
// Federación con el hub (docs/rfcs/0002): ingesta (paginar+upsert) e imágenes
// (copiar a R2). Colas separadas = aislamiento de rate-limit (hub vs Supabase).
export const HUB_INGEST_QUEUE = "hub-ingest";
export const HUB_IMAGES_QUEUE = "hub-images";

const REMOVE_ON_COMPLETE = Number(process.env.QUEUE_REMOVE_ON_COMPLETE || 1000);
const REMOVE_ON_FAIL = Number(process.env.QUEUE_REMOVE_ON_FAIL || 5000);

// Equivalente al visibility_timeout de Celery: el lockDuration por defecto de
// BullMQ es 30s. Los jobs largos (ingest/tabla ~200s) lo excederían y BullMQ los
// marcaría "stalled" y los RE-EJECUTARÍA en paralelo. Subimos el lock por encima
// del job más largo. El worker renueva el lock mientras procesa.
export const LONG_JOB_LOCK_MS = Number(process.env.LONG_JOB_LOCK_MS || 300_000);

// External hosts (reconexión S3 etc.) get hammered by the photo job — cap the
// global rate. Tune via env if we see 429s. Default: 20 jobs / second.
const PHOTO_RATE_MAX = Number(process.env.PHOTO_RATE_MAX || 20);
const PHOTO_RATE_DURATION = Number(process.env.PHOTO_RATE_DURATION_MS || 1000);

// Hub: respeta su ~120 req/60s. Por defecto 100/60s (deja margen para 429).
const HUB_INGEST_RATE_MAX = Number(process.env.HUB_INGEST_RATE_MAX || 100);
const HUB_INGEST_RATE_DURATION = Number(process.env.HUB_INGEST_RATE_DURATION_MS || 60_000);
// Imágenes del hub (Supabase de los socios): gentil, como migrate-photos.
const HUB_IMAGE_RATE_MAX = Number(process.env.HUB_IMAGE_RATE_MAX || 20);
const HUB_IMAGE_RATE_DURATION = Number(process.env.HUB_IMAGE_RATE_DURATION_MS || 1000);

// Cadencias del scheduler (Celery-Beat-equivalente de BullMQ).
const HUB_INCREMENTAL_EVERY_MS = Number(process.env.HUB_INCREMENTAL_EVERY_MS || 5 * 60_000);
const HUB_RECONCILE_EVERY_MS = Number(process.env.HUB_RECONCILE_EVERY_MS || 6 * 60 * 60_000);

let _tablesQ: Queue | null = null;
let _photosQ: Queue | null = null;
let _hubIngestQ: Queue | null = null;
let _hubImagesQ: Queue | null = null;

// streams.events.maxLen caps the BullMQ event stream in Valkey so it doesn't
// grow unbounded over a 26k-job run (standard pattern).
const QUEUE_OPTS = {
  prefix: PREFIX,
  streams: { events: { maxLen: 1000 } },
} as const;

export function tablesQueue(): Queue {
  if (!_tablesQ)
    _tablesQ = new Queue(TABLES_QUEUE, { connection: getRedis(), ...QUEUE_OPTS });
  return _tablesQ;
}
export function photosQueue(): Queue {
  if (!_photosQ)
    _photosQ = new Queue(PHOTOS_QUEUE, { connection: getRedis(), ...QUEUE_OPTS });
  return _photosQ;
}
export function hubIngestQueue(): Queue {
  if (!_hubIngestQ)
    _hubIngestQ = new Queue(HUB_INGEST_QUEUE, { connection: getRedis(), ...QUEUE_OPTS });
  return _hubIngestQ;
}
export function hubImagesQueue(): Queue {
  if (!_hubImagesQ)
    _hubImagesQ = new Queue(HUB_IMAGES_QUEUE, { connection: getRedis(), ...QUEUE_OPTS });
  return _hubImagesQ;
}

// ---- Producers (deterministic jobId = idempotent / resumable) --------------

export async function enqueueTable(name: string, opts?: JobsOptions) {
  return tablesQueue().add(
    name,
    { table: name },
    {
      jobId: `tbl-${name}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
}

export async function enqueuePhoto(table: PhotoTable, id: string, opts?: JobsOptions) {
  return photosQueue().add(
    table,
    { table, id },
    {
      jobId: `img-${table}-${id}`, // dedupe: re-enqueue is a no-op (no ':' — BullMQ forbids it)
      attempts: 4,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
}

// ---- Hub producers ---------------------------------------------------------

/**
 * Encola un job de ingesta del hub. jobId determinista POR MODO para que el
 * incremental (scheduler) y un backfill/reconcile manual no se pisen, y para que
 * un re-enqueue del mismo modo sea idempotente mientras está pendiente.
 */
export async function enqueueHubIngest(
  type: HubType,
  mode: IngestMode,
  opts?: JobsOptions,
) {
  return hubIngestQueue().add(
    type,
    { type, mode },
    {
      jobId: `hub-${mode}-${type}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
}

/** Encola la copia a R2 de la foto de un registro del hub. Dedupe por hub_id. */
export async function enqueueHubImage(type: HubType, hubId: string, opts?: JobsOptions) {
  return hubImagesQueue().add(
    type,
    { type, hubId },
    {
      jobId: `himg-${type}-${hubId}`,
      attempts: 4,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL,
      ...opts,
    },
  );
}

// El job de ingesta encola imágenes a través de este puente (evita el ciclo de
// imports job <-> queue). Se conecta una vez aquí.
setImageEnqueuer((type, hubId) => enqueueHubImage(type, hubId));

/**
 * Registra los schedulers repetibles del hub (equivalente a Celery Beat).
 * Idempotente: upsertJobScheduler se puede llamar en cada arranque del worker.
 *   - incremental cada 5 min (un job por tipo)
 *   - reconcile cada 6 h (re-scan completo, capta ediciones)
 */
export async function registerHubSchedulers(): Promise<void> {
  if (!HUB_FEDERATION_ENABLED) {
    console.log("[hub] ENABLE_HUB_FEDERATION no está activo — schedulers no registrados.");
    return;
  }
  assertHubFederationConfigured();
  const q = hubIngestQueue();
  for (const type of HUB_TYPES) {
    await q.upsertJobScheduler(
      `hub-incremental-${type}`,
      { every: HUB_INCREMENTAL_EVERY_MS },
      { name: type, data: { type, mode: "incremental" as IngestMode } },
    );
    await q.upsertJobScheduler(
      `hub-reconcile-${type}`,
      { every: HUB_RECONCILE_EVERY_MS },
      { name: type, data: { type, mode: "reconcile" as IngestMode } },
    );
  }
  console.log(
    `[hub] schedulers registrados: incremental=${HUB_INCREMENTAL_EVERY_MS}ms reconcile=${HUB_RECONCILE_EVERY_MS}ms x ${HUB_TYPES.length} tipos`,
  );
}

// ---- Workers ---------------------------------------------------------------

const tablesProcessor: Processor = async (job) => {
  const spec = TABLES.find((t) => t.name === job.data.table);
  if (!spec) throw new Error(`Unknown table: ${job.data.table}`);
  return migrateTable(spec);
};

const photosProcessor: Processor = async (job) =>
  migratePhoto(job.data.table as PhotoTable, job.data.id as string);

const hubIngestProcessor: Processor = async (job) => {
  try {
    return await hubIngest(job.data.type as HubType, job.data.mode as IngestMode);
  } catch (err) {
    // El hub devolvió 429 con Retry-After: respetamos la señal del servidor en
    // vez del backoff fijo (audit B-4). moveToDelayed reprograma este intento
    // exacto sin contar como fallo.
    const retryAfter = (err as { retryAfter?: number })?.retryAfter;
    if (typeof retryAfter === "number" && retryAfter > 0 && job.token) {
      await job.moveToDelayed(Date.now() + retryAfter * 1000, job.token);
      // BullMQ exige lanzar DelayedError para señalar "reprogramado, no fallido".
      const { DelayedError } = await import("bullmq");
      throw new DelayedError();
    }
    throw err;
  }
};

const hubImageProcessor: Processor = async (job) =>
  hubImage(job.data.type as HubType, job.data.hubId as string);

export function createWorkers(): Worker[] {
  const conn = getRedis();
  const tablesConcurrency = Number(process.env.TABLES_CONCURRENCY || 4);
  const photosConcurrency = Number(process.env.PHOTOS_CONCURRENCY || 8);

  const tablesWorker = new Worker(TABLES_QUEUE, tablesProcessor, {
    connection: conn,
    prefix: PREFIX,
    concurrency: tablesConcurrency,
    lockDuration: LONG_JOB_LOCK_MS, // migrar una tabla grande puede tardar
  });
  const photosWorker = new Worker(PHOTOS_QUEUE, photosProcessor, {
    connection: conn,
    prefix: PREFIX,
    concurrency: photosConcurrency,
    limiter: { max: PHOTO_RATE_MAX, duration: PHOTO_RATE_DURATION },
  });

  const workers: Worker[] = [tablesWorker, photosWorker];
  for (const [label, w] of [
    ["tables", tablesWorker],
    ["photos", photosWorker],
  ] as const) {
    w.on("failed", (job, err) => {
      console.error(`[${label}] job ${job?.id} failed:`, err?.message || err);
      // Solo al AGOTAR reintentos lo mandamos al DLQ (no en cada intento).
      if (isExhausted(job)) {
        void recordDeadLetter(label, job, err, Date.now());
      }
    });
    w.on("error", (err) => console.error(`[${label}] worker error:`, err?.message || err));
  }
  tablesWorker.on("completed", (job, r) =>
    console.log(`[tables] ${job.id} ->`, JSON.stringify(r)),
  );
  photosWorker.on("completed", (job, r) => {
    if (r?.status && r.status !== "migrated") return; // keep logs quiet for skips
    console.log(`[photos] ${job.id} -> ${r?.status}`);
  });

  // Federación con el hub (worker/hub/**): módulo OFF por defecto (gating). Sin
  // ENABLE_HUB_FEDERATION=true, ni el worker de ingesta ni el de imágenes se
  // crean — nadie consume esas colas y los jobs (si algo los encolara) quedan
  // simplemente esperando en Redis, sin trabajo de red hacia ningún hub externo.
  if (HUB_FEDERATION_ENABLED) {
    assertHubFederationConfigured();
    const hubIngestConcurrency = Number(process.env.HUB_INGEST_CONCURRENCY || 2);
    const hubImageConcurrency = Number(process.env.HUB_IMAGE_CONCURRENCY || 8);

    const hubIngestWorker = new Worker(HUB_INGEST_QUEUE, hubIngestProcessor, {
      connection: conn,
      prefix: PREFIX,
      concurrency: hubIngestConcurrency,
      limiter: { max: HUB_INGEST_RATE_MAX, duration: HUB_INGEST_RATE_DURATION },
      lockDuration: LONG_JOB_LOCK_MS, // un ciclo de ingesta pagina hasta ~200s
    });
    const hubImageWorker = new Worker(HUB_IMAGES_QUEUE, hubImageProcessor, {
      connection: conn,
      prefix: PREFIX,
      concurrency: hubImageConcurrency,
      limiter: { max: HUB_IMAGE_RATE_MAX, duration: HUB_IMAGE_RATE_DURATION },
    });

    for (const [label, w] of [
      ["hub-ingest", hubIngestWorker],
      ["hub-images", hubImageWorker],
    ] as const) {
      w.on("failed", (job, err) => {
        console.error(`[${label}] job ${job?.id} failed:`, err?.message || err);
        if (isExhausted(job)) void recordDeadLetter(label, job, err, Date.now());
      });
      w.on("error", (err) => console.error(`[${label}] worker error:`, err?.message || err));
    }
    hubIngestWorker.on("completed", (job, r) =>
      console.log(`[hub-ingest] ${job.id} ->`, JSON.stringify(r)),
    );
    hubImageWorker.on("completed", (job, r) => {
      if (r?.status && r.status !== "migrated") return;
      console.log(`[hub-images] ${job.id} -> ${r?.status}`);
    });

    workers.push(hubIngestWorker, hubImageWorker);
  } else {
    console.log("[hub] ENABLE_HUB_FEDERATION no está activo — workers hub-ingest/hub-images no se crean.");
  }

  return workers;
}
