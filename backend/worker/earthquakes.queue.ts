/**
 * Cola dedicada al sync de sismos del USGS, filtrados a la región configurada
 * (ver EARTHQUAKES_MIN/MAX_LAT/LNG en src/services/earthquakes.ts).
 *
 * Patrón de las otras colas (un módulo por cola, productor + consumidor), pero
 * MÁS simple: el trabajo es chico (un fetch al feed realtime + upsert de un
 * puñado de filas en una región de baja actividad sísmica), así que el
 * processor corre la lógica inline en vez de importar un motor pesado de forma
 * perezosa.
 *
 * - Scheduler repetible cada EARTHQUAKES_EVERY_MS (default 60s = la cadencia con
 *   la que USGS refresca el feed). Apagable con SYNC_SCHEDULERS=0 (igual que los
 *   demás schedulers del worker).
 * - Backfill puntual de los últimos N días, una vez al arrancar si la tabla está
 *   vacía (FDSN query, una sola llamada). Idempotente.
 *
 * Requiere VALKEY_URL (BullMQ) + DATABASE_URL (el service escribe vía Drizzle).
 */
import { Queue, Worker, type Processor, type JobsOptions } from "bullmq";
import { getRedis } from "./redis";

const PREFIX = process.env.QUEUE_PREFIX || "mapa";
export const EARTHQUAKES_QUEUE = "earthquakes";

const REMOVE_ON_COMPLETE = Number(process.env.QUEUE_REMOVE_ON_COMPLETE || 1000);
const REMOVE_ON_FAIL = Number(process.env.QUEUE_REMOVE_ON_FAIL || 5000);

// Cadencia del sync incremental. Default 60s = el feed del USGS se refresca cada
// minuto, así que poleamos al ritmo de la fuente.
const EARTHQUAKES_EVERY_MS = Number(process.env.EARTHQUAKES_EVERY_MS || 60_000);

type EarthquakeJob = { mode: "sync" | "backfill"; days?: number };

let _queue: Queue | null = null;
function queue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(EARTHQUAKES_QUEUE, {
    connection: getRedis(),
    prefix: PREFIX,
    streams: { events: { maxLen: 1000 } },
  });
  return _queue;
}

// --------------------------------------------------------------------------
// Productor
// --------------------------------------------------------------------------

/** Encola un sync/backfill puntual. jobId determinístico → re-disparo no-op. */
export async function enqueueEarthquakeSync(
  data: EarthquakeJob = { mode: "sync" },
  opts?: JobsOptions,
): Promise<string> {
  const job = await queue().add(data.mode, data, {
    jobId: `earthquakes-${data.mode}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL,
    ...opts,
  });
  return job.id!;
}

/**
 * Registra el scheduler repetible (cada EARTHQUAKES_EVERY_MS) y dispara un
 * backfill puntual si la tabla está vacía. Idempotente en cada arranque.
 */
export async function registerEarthquakeSchedulers(): Promise<void> {
  // Falla rápido y con mensaje accionable si falta el bounding box (ninguna
  // región real viene por default — ver src/services/earthquakes.ts). El
  // caller (worker/index.ts) ya envuelve esta llamada en .catch(), así que un
  // throw aquí queda logueado y el módulo de sismos simplemente no arranca, en
  // vez de tumbar el proceso worker completo.
  const { getBbox } = await import("../src/services/earthquakes");
  getBbox();

  const q = queue();
  await q.upsertJobScheduler(
    "earthquakes-sync",
    { every: EARTHQUAKES_EVERY_MS },
    { name: "sync", data: { mode: "sync" } satisfies EarthquakeJob },
  );

  // Backfill de arranque: solo si la tabla está vacía (primer deploy / DB nueva).
  try {
    const { isEmpty } = await import("../src/services/earthquakes");
    if (await isEmpty()) {
      await enqueueEarthquakeSync({ mode: "backfill" });
      console.log("[earthquakes] tabla vacía → backfill de arranque encolado");
    }
  } catch (err) {
    console.error(
      "[earthquakes] no se pudo verificar/encolar backfill:",
      err instanceof Error ? err.message : err,
    );
  }

  console.log(`[earthquakes] scheduler registrado: cada ${EARTHQUAKES_EVERY_MS}ms`);
}

// --------------------------------------------------------------------------
// Consumidor — lógica inline (el trabajo es chico).
// --------------------------------------------------------------------------

const processor: Processor = async (job) => {
  const { mode, days } = job.data as EarthquakeJob;
  const { syncFromFeed, backfill } = await import("../src/services/earthquakes");
  const now = Date.now();
  return mode === "backfill" ? backfill(now, days) : syncFromFeed(now);
};

export function createEarthquakesWorker(): Worker {
  return new Worker(EARTHQUAKES_QUEUE, processor, {
    connection: getRedis(),
    prefix: PREFIX,
    concurrency: 1, // un solo sync a la vez; el job es corto
    // Cortesía con el USGS: como mucho 1 fetch cada 30s aunque algo dispare de más.
    limiter: { max: 1, duration: 30_000 },
  });
}
