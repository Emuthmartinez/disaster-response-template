/**
 * Worker entrypoint — runs the BullMQ workers for this app: sources-sync,
 * maintenance, patient-imports, earthquakes, needs-publication (gated by
 * ENABLE_RESPONSEGRID), hub ingest/images (gated by ENABLE_HUB_FEDERATION),
 * plus the always-idle migrate-tables/migrate-photos queues used only by the
 * optional one-time import tooling in worker/enqueue.ts (see worker/db.ts).
 * Deployed as its own container, separate from the app, in docker-compose
 * (see docker-compose.prod.yml). Graceful SIGTERM (standard pattern): drain
 * in-flight jobs before exit so a rolling restart never drops work.
 */
import { createWorkers, registerHubSchedulers } from "./queues";
import {
  createSourcesSyncWorker,
  registerSourceSchedulers,
} from "./sourcesSync.queue";
import {
  createMaintenanceWorker,
  registerMaintenanceSchedulers,
} from "./maintenance.queue";
import { createPatientImportsWorker } from "./patientImports.queue";
import {
  createEarthquakesWorker,
  registerEarthquakeSchedulers,
} from "./earthquakes.queue";
import { createNeedsPublicationWorker } from "./needsPublication.queue";
import { recordDeadLetter, isExhausted } from "./deadletter";
import { closePools } from "./db";

// Red de seguridad a nivel de proceso (audit B-1): BullMQ atrapa los throws de
// los processors, pero un rejection/throw FUERA de un job (un .catch olvidado,
// un timer) podría tumbar o quedar en silencio. Logueamos fuerte. No salimos en
// unhandledRejection (suele ser recuperable); en uncaughtException sí, para que
// k8s reinicie un proceso en estado indefinido.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException — saliendo para reinicio:", err);
  process.exit(1);
});

const workers = createWorkers();

// Worker de sync de fuentes externas (reemplaza el sync inline del request path).
const sourcesSyncWorker = createSourcesSyncWorker();
sourcesSyncWorker.on("failed", (job, err) => {
  console.error(`[sources-sync] job ${job?.id} failed:`, err?.message || err);
  if (isExhausted(job)) void recordDeadLetter("sources-sync", job, err, Date.now());
});
sourcesSyncWorker.on("error", (err) =>
  console.error("[sources-sync] worker error:", err?.message || err),
);
sourcesSyncWorker.on("completed", (job, r) =>
  console.log(`[sources-sync] ${job.id} ->`, JSON.stringify(r)),
);
workers.push(sourcesSyncWorker);

// Worker de mantenimiento (geocode + reporte de duplicados).
const maintenanceWorker = createMaintenanceWorker();
maintenanceWorker.on("failed", (job, err) => {
  console.error(`[maintenance] job ${job?.id} failed:`, err?.message || err);
  if (isExhausted(job)) void recordDeadLetter("maintenance", job, err, Date.now());
});
maintenanceWorker.on("error", (err) =>
  console.error("[maintenance] worker error:", err?.message || err),
);
maintenanceWorker.on("completed", (job) =>
  console.log(`[maintenance] ${job.id} (${job.name}) completed`),
);
workers.push(maintenanceWorker);

// Worker de importación de pacientes hospitalarios (#151): normaliza/valida/
// deduplica el staging y aplica las filas válidas/únicas fuera del request path.
const patientImportsWorker = createPatientImportsWorker();
patientImportsWorker.on("failed", (job, err) => {
  console.error(`[patient-imports] job ${job?.id} failed:`, err?.message || err);
  if (isExhausted(job)) void recordDeadLetter("patient-imports", job, err, Date.now());
});
patientImportsWorker.on("error", (err) =>
  console.error("[patient-imports] worker error:", err?.message || err),
);
patientImportsWorker.on("completed", (job, r) =>
  console.log(`[patient-imports] ${job.id} ->`, JSON.stringify(r)),
);
workers.push(patientImportsWorker);

// Worker de sismos (USGS). Sync incremental del feed realtime cada minuto +
// backfill de arranque. Trabajo chico en una región de baja actividad sísmica
// (ver EARTHQUAKES_MIN/MAX_LAT/LNG en src/services/earthquakes.ts).
const earthquakesWorker = createEarthquakesWorker();
earthquakesWorker.on("failed", (job, err) => {
  console.error(`[earthquakes] job ${job?.id} failed:`, err?.message || err);
  if (isExhausted(job)) void recordDeadLetter("earthquakes", job, err, Date.now());
});
earthquakesWorker.on("error", (err) =>
  console.error("[earthquakes] worker error:", err?.message || err),
);
earthquakesWorker.on("completed", (job, r) =>
  console.log(`[earthquakes] ${job.id} ->`, JSON.stringify(r)),
);
workers.push(earthquakesWorker);

// Módulo ResponseGrid (needs): OFF por defecto (gating). Sin
// ENABLE_RESPONSEGRID=true, este worker ni se crea — ningún job de
// needs-publication se consume (el productor, si algo lo encoló, lo deja en
// espera en Redis en vez de fallar contra un publisher deshabilitado en bucle
// de reintentos). env.ts ya valida en el arranque del app que
// RESPONSEGRID_API_URL/RESPONSEGRID_EMERGENCY_SLUG estén si el flag es true.
if (process.env.ENABLE_RESPONSEGRID === "true") {
  const needsPublicationWorker = createNeedsPublicationWorker();
  needsPublicationWorker.on("failed", (job, err) => {
    console.error(`[needs-publication] job ${job?.id} failed:`, err?.message || err);
    if (isExhausted(job)) {
      void recordDeadLetter("needs-publication", job, err, Date.now());
    }
  });
  needsPublicationWorker.on("error", (err) =>
    console.error("[needs-publication] worker error:", err?.message || err),
  );
  workers.push(needsPublicationWorker);
} else {
  console.log(
    "[needs-publication] ENABLE_RESPONSEGRID no está activo — worker no se crea.",
  );
}

console.log(`[worker] started ${workers.length} workers`);

// Schedulers repetibles del hub (federación con otros sitios socios, RFC 0002):
// incremental cada 5 min + reconcile cada 6 h. Módulo OFF por defecto — solo se
// registra con ENABLE_HUB_FEDERATION=true (registerHubSchedulers() lo valida y
// además exige HUB_BASE_URL). HUB_SCHEDULERS=0 sigue disponible para apagarlo
// puntualmente incluso con el flag activo (p. ej. para correr solo la migración).
if (process.env.HUB_SCHEDULERS !== "0") {
  registerHubSchedulers().catch((err) =>
    console.error("[hub] no se pudieron registrar schedulers:", err?.message || err),
  );
}

// Scheduler del sync de fuentes externas (reemplaza el cron de Vercel). Apagable
// con SYNC_SCHEDULERS=0. IMPORTANTE: no apagar el cron viejo hasta verificar que
// este registra y corre (audit RFC 0003 §5, riesgo de rollout).
if (process.env.SYNC_SCHEDULERS !== "0") {
  registerSourceSchedulers().catch((err) =>
    console.error("[sources-sync] no se pudieron registrar schedulers:", err?.message || err),
  );
  registerMaintenanceSchedulers().catch((err) =>
    console.error("[maintenance] no se pudieron registrar schedulers:", err?.message || err),
  );
}

// Sismos USGS: SIEMPRE encendido (no va bajo SYNC_SCHEDULERS, que apaga los
// scrapers/federación pesados). Es dato público, barato y siempre deseado: una
// llamada al feed cada minuto + backfill de arranque idempotente (solo si la
// tabla está vacía → siembra sola en el primer deploy, sin Job ni paso manual).
registerEarthquakeSchedulers().catch((err) =>
  console.error("[earthquakes] no se pudieron registrar schedulers:", err?.message || err),
);

// Cap del drenado: worker.close() espera a que terminen los jobs activos, pero
// un job puede correr ~200s (sync chunked). Acotamos a 210s (< los 240s del
// terminationGracePeriodSeconds de k8s) para salir limpio ANTES del SIGKILL. Si
// un job no terminó, BullMQ lo reintenta (idempotente + checkpointed). Capa
// equivalente a un CELERY_WORKER_SOFT_SHUTDOWN_TIMEOUT estándar.
const CLOSE_TIMEOUT_MS = Number(process.env.WORKER_CLOSE_TIMEOUT_MS || 210_000);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} — closing workers (cap ${CLOSE_TIMEOUT_MS}ms)...`);
  const drain = Promise.allSettled(workers.map((w) => w.close()));
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.warn("[worker] drain timeout — forcing close (jobs en vuelo se reintentarán)");
      resolve();
    }, CLOSE_TIMEOUT_MS),
  );
  await Promise.race([drain, timeout]);
  await closePools();
  console.log("[worker] closed. bye.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
