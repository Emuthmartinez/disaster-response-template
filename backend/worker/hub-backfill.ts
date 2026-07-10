/**
 * Productor one-shot: carga INICIAL de la federación del hub. Encola un job de
 * backfill por tipo (recorre TODO desde el inicio) en la cola hub-ingest; el
 * worker normal (worker/index.ts, el mismo contenedor que ya corre en
 * docker-compose) hace el trabajo. Reanudable + idempotente (cursor en
 * hub_sync_state, upsert por hub_id). Ver docs/rfcs/0002.
 *
 * Correr una sola vez tras crear las tablas, dentro del contenedor `worker`
 * (o localmente con el mismo env que usa ese contenedor):
 *   npx tsx worker/hub-backfill.ts
 *
 * Después de esto, el scheduler incremental (cada 5 min) mantiene todo al día.
 * Lock de productor (patrón SET NX EX estándar) para que dos no compitan.
 */
import { acquireLock, releaseLock, startHeartbeat, getRedis } from "./redis";
import { enqueueHubIngest } from "./queues";
import { HUB_TYPES, HUB_FEDERATION_ENABLED, assertHubFederationConfigured } from "./hub/config";
import { closePools } from "./db";

const LOCK_KEY = "hub:backfill:lock";
const LOCK_TTL = 1800; // 30 min
const HEARTBEAT_MS = 600_000; // 10 min

async function main() {
  if (!HUB_FEDERATION_ENABLED) {
    console.error(
      "[hub-backfill] ENABLE_HUB_FEDERATION no está activo — este script no hace nada sin ese flag. " +
        "Actívalo (y configura HUB_BASE_URL) si de verdad quieres traer el histórico de un hub externo.",
    );
    process.exit(1);
  }
  assertHubFederationConfigured();
  const token = await acquireLock(LOCK_KEY, LOCK_TTL);
  if (!token) {
    console.error("[hub-backfill] otro productor tiene el lock — saliendo.");
    process.exit(1);
  }
  const stopHeartbeat = startHeartbeat(LOCK_KEY, token, LOCK_TTL, HEARTBEAT_MS);
  try {
    for (const type of HUB_TYPES) {
      const job = await enqueueHubIngest(type, "backfill");
      console.log(`[hub-backfill] encolado ${type} (job ${job.id})`);
    }
    console.log(
      "[hub-backfill] listo. El Deployment de workers procesa la cola hub-ingest;" +
        " cada tipo reanuda por su cursor hasta completar el ciclo.",
    );
  } finally {
    stopHeartbeat();
    await releaseLock(LOCK_KEY, token);
    await closePools();
    getRedis().disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[hub-backfill] fatal:", err);
  process.exit(1);
});
