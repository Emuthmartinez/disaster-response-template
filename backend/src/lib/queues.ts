/**
 * Lado PRODUCTOR de las colas BullMQ. Los handlers de sync/* NO corren trabajo
 * pesado inline (audit M-2): encolan un job y devuelven 202; el worker (proceso
 * aparte) lo procesa. Este módulo solo encola y consulta estado — la lógica
 * pesada (runSyncChunked, geocode, dedup) vive en el worker.
 *
 * Espeja worker/sourcesSync.queue.ts + worker/maintenance.queue.ts del app Next:
 * MISMOS nombres de cola, prefijo, jobId determinísticos (idempotencia) y shape
 * del estado, para que worker y backend hablen exactamente el mismo protocolo.
 *
 * Conexión: BullMQ EXIGE maxRetriesPerRequest:null (un cliente ioredis dedicado,
 * distinto del de rate-limit). Si no hay VALKEY_URL, encolar lanza → el handler
 * traduce a 503 "No se pudo encolar" (mismo contrato que el route previo).
 */
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/config/env";
import { getQueueProducer } from "@/lib/job-dispatch";

const PREFIX = env.QUEUE_PREFIX;
const SOURCES_SYNC_QUEUE = "sources-sync";
const MAINTENANCE_QUEUE = "maintenance";
const PATIENT_IMPORTS_QUEUE = "patient-imports";
const REMOVE_ON_COMPLETE = env.QUEUE_REMOVE_ON_COMPLETE;
const REMOVE_ON_FAIL = env.QUEUE_REMOVE_ON_FAIL;

export type SyncMode = "chunk" | "full";

export interface SyncJobData {
  sourceId: string;
  mode: SyncMode;
  dryRun?: boolean;
  limit?: number;
  pagesPerRun?: number;
  statusFilter?: "found" | "missing";
}

export interface JobState {
  jobId: string;
  state: string;
  progress: unknown;
  result: unknown;
  failedReason: string | null;
}

// Cliente ioredis dedicado para BullMQ (maxRetriesPerRequest:null, requerido).
let _conn: IORedis | null = null;
function connection(): IORedis {
  if (_conn) return _conn;
  if (!env.VALKEY_URL) throw new Error("VALKEY_URL no está configurada.");
  _conn = new IORedis(env.VALKEY_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return _conn;
}

const _queues = new Map<string, Queue>();
function queue(name: string): Queue {
  let q = _queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: connection(),
      prefix: PREFIX,
      streams: { events: { maxLen: 1000 } },
    });
    _queues.set(name, q);
  }
  return q;
}

/**
 * Encola un sync para UNA fuente. jobId determinístico por (fuente, modo): un
 * re-disparo con un job pendiente es no-op (BullMQ ignora ids existentes). `-` no
 * `:` (BullMQ prohíbe `:`). Devuelve el jobId para el status-poll.
 */
export async function enqueueSourceSync(
  data: SyncJobData,
  opts?: JobsOptions,
): Promise<string> {
  const jobId = `sync-${data.mode}-${data.sourceId}`;
  const q = queue(SOURCES_SYNC_QUEUE);
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

/** Cancela jobs de sync pendientes/activos (p. ej. antes de resetear cursor). */
export async function cancelSourceSyncJobs(sourceId?: string): Promise<number> {
  const q = queue(SOURCES_SYNC_QUEUE);
  const jobs = await q.getJobs(["active", "waiting", "delayed", "paused"]);
  let cancelled = 0;
  for (const job of jobs) {
    const data = job.data as SyncJobData;
    if (sourceId && data.sourceId !== sourceId) continue;
    if ((await job.getState()) === "active") {
      await job
        .moveToFailed(new Error("cancelled by sync reset"), "0")
        .catch(() => {});
    }
    await job.remove().catch(() => {});
    cancelled++;
  }
  return cancelled;
}

/** Encola el geocode. jobId fijo → un re-trigger pendiente es no-op. */
export async function enqueueGeocode(
  maxLocations?: number,
  opts?: JobsOptions,
): Promise<string> {
  const job = await queue(MAINTENANCE_QUEUE).add(
    "geocode",
    { kind: "geocode", maxLocations },
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

/** Encola un reporte de duplicados. jobId por (source, limitGroups). */
export async function enqueueDuplicatesReport(
  source: string | undefined,
  limitGroups: number | undefined,
  opts?: JobsOptions,
): Promise<string> {
  const job = await queue(MAINTENANCE_QUEUE).add(
    "duplicates",
    { kind: "duplicates", source, limitGroups },
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

/**
 * Modo del job de importación de pacientes:
 *   - process: normaliza/valida/deduplica el staging ya materializado.
 *   - apply:   escribe las filas válidas y únicas al final (idempotente).
 *   - ocr:     extrae filas de una imagen (Minimax) y luego corre el process.
 */
export type PatientImportMode = "process" | "apply" | "ocr";

export interface PatientImportJobData {
  importId: string;
  mode: PatientImportMode;
  /** user.id que disparó el apply (auditoría/procedencia). Opcional. */
  actorId?: string | null;
  /**
   * URL http/https de la imagen a extraer por OCR (modo "ocr"). Viaja SOLO en el
   * payload del job (Redis), nunca se persiste en la DB de staging ni se expone en
   * una respuesta de la API. Privacidad: el dato crudo no sale del worker.
   */
  imageUrl?: string;
  /**
   * Archivo CSV/XLSX en base64 (modo "process" de un lote de archivo) y su
   * contentType. Viajan SOLO en el payload del job (Redis): el worker los parsea,
   * materializa las filas en staging y corre el process. NUNCA se persisten en la
   * DB de staging ni se exponen en una respuesta de la API. Ausentes para lotes
   * JSON (cuyas filas ya se materializaron en la creación).
   */
  contentType?: string;
  fileBase64?: string;
}

/**
 * Encola el OCR, el procesado o el apply de un lote de pacientes. jobId
 * determinístico por (modo, importId): un re-disparo con un job pendiente del
 * mismo modo es no-op (idempotencia). El payload es minúsculo (id + url OCR
 * opcional) — las filas viven en la DB de staging, no en el job. Devuelve el
 * jobId para trazabilidad. Para CSV/XLSX, el archivo base64 viaja solo en el
 * payload del job y el worker lo materializa en staging.
 */
/** Binding de Cloudflare Queues para importaciones (wrangler.jsonc). */
export const PATIENT_IMPORTS_BINDING = "IMPORTS_QUEUE";

export async function enqueuePatientImport(
  data: PatientImportJobData,
  opts?: JobsOptions,
): Promise<string> {
  // Seam de transporte, mismo criterio que lib/job-dispatch: un binding de
  // Cloudflare Queues gana; BullMQ es el camino compose. Inline aquí (y no vía
  // dispatchJob) para conservar intactas las opciones BullMQ (jobId
  // determinista, backoff, removeOn*) del camino compose.
  const producer = getQueueProducer(PATIENT_IMPORTS_BINDING);
  if (producer) {
    let payload: PatientImportJobData = data;
    if (data.fileBase64 !== undefined && data.contentType !== undefined) {
      // Límite de 128 KB por mensaje en Queues: el archivo NO viaja en el
      // mensaje. Se materializan las filas aquí (mismo resultado que haría el
      // worker de BullMQ) y se encola solo el process.
      const { stageFileRows } = await import("@/services/patient-imports");
      await stageFileRows(data.importId, data.contentType, data.fileBase64);
      payload = { importId: data.importId, mode: "process" };
    }
    await producer.send(payload);
    return `pimport-${data.mode}-${data.importId}`;
  }

  const job = await queue(PATIENT_IMPORTS_QUEUE).add(`${data.mode}-${data.importId}`, data, {
    jobId: `pimport-${data.mode}-${data.importId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
    ...opts,
  });
  return job.id!;
}

export function getPatientImportJobState(jobId: string): Promise<JobState | null> {
  return jobState(PATIENT_IMPORTS_QUEUE, jobId);
}

async function jobState(queueName: string, jobId: string): Promise<JobState | null> {
  // Sin BullMQ (Workers) no hay registro de jobs que consultar: null en vez de
  // lanzar, para que los endpoints de estado degraden con elegancia.
  if (!env.VALKEY_URL) return null;
  const job = await queue(queueName).getJob(jobId);
  if (!job) return null;
  return {
    jobId,
    state: await job.getState(),
    progress: job.progress,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  };
}

export function getSyncJobState(jobId: string): Promise<JobState | null> {
  return jobState(SOURCES_SYNC_QUEUE, jobId);
}

export function getMaintenanceJobState(jobId: string): Promise<JobState | null> {
  return jobState(MAINTENANCE_QUEUE, jobId);
}
