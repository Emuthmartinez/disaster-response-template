/**
 * Producer — enqueues the migration work. Run as a one-off k8s Job (or locally).
 * Re-runnable: deterministic jobIds dedupe, and a Valkey lock stops two
 * producers racing. Safe to run repeatedly to pick up new syncs / pending photos.
 *
 * Order matters:
 *   1. Acquire the producer lock (standard SET NX EX pattern).
 *   2. Enqueue every table migration (Neon -> Hetzner upsert). These should run
 *      and FINISH before photos, because photo jobs read rows from the target.
 *   3. Wait for the table jobs to drain, then scan the target for rows whose
 *      photo isn't on R2 yet (photo_migrated_at IS NULL) and enqueue one photo
 *      job per row.
 *
 * Env: STScopes — DATABASE_URL (target), NEON_DATABASE_URL (source), VALKEY_URL,
 * R2_*. PRODUCER_SKIP_TABLES=1 / PRODUCER_SKIP_PHOTOS=1 to run a single phase.
 */
import { acquireLock, releaseLock, startHeartbeat, getRedis } from "./redis";
import { enqueueTable, enqueuePhoto, tablesQueue } from "./queues";
import { TABLES } from "./tables";
import { targetPool, closePools } from "./db";
import type { PhotoTable } from "./jobs/migratePhoto";

const LOCK_KEY = "migrate:producer:lock";
const LOCK_TTL = 1800; // 30 min
const HEARTBEAT_MS = 600_000; // 10 min
const PHOTO_SCAN_BATCH = 1000;

async function enqueueAllTables() {
  const q = tablesQueue();
  for (const t of TABLES) {
    // Deterministic jobId (`tbl-<name>`) dedupes — but a prior COMPLETED or
    // FAILED job with that id makes `add` a silent no-op, so a re-run would
    // never re-execute (e.g. tables that failed before a code fix shipped).
    // Remove the old record first so every producer run actually re-runs the
    // table copy against current code/schema. Idempotent: copy is upsert.
    await q.remove(`tbl-${t.name}`).catch(() => {});
    const job = await enqueueTable(t.name);
    console.log(`[enqueue] table ${t.name} (job ${job.id})`);
  }
}

/**
 * Block until the migrate-tables queue has nothing waiting/active, then FAIL
 * loudly if any table job ended up failed — otherwise we'd march on to photos
 * and silently leave whole tables unmigrated (the hospitals/sync_runs/etc bug).
 */
async function waitForTables(timeoutMs = 1_800_000) {
  const q = tablesQueue();
  const start = Date.now();
  while (true) {
    const counts = await q.getJobCounts("waiting", "active", "delayed", "paused");
    const pending =
      (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0) + (counts.paused || 0);
    if (pending === 0) break;
    if (Date.now() - start > timeoutMs) throw new Error("table migration timed out");
    await new Promise((r) => setTimeout(r, 3000));
  }
  const failed = await q.getFailed();
  if (failed.length > 0) {
    const detail = failed
      .map((j) => `${j.name}: ${j.failedReason ?? "unknown"}`)
      .join("\n  ");
    throw new Error(
      `${failed.length} table migration job(s) failed — aborting before photos:\n  ${detail}`,
    );
  }
}

/** Keyset-scan the target for rows needing a photo migration; enqueue one each. */
async function enqueuePendingPhotos(table: PhotoTable): Promise<number> {
  const pool = targetPool();
  const extPred =
    table === "missing_persons"
      ? "(photo IS NOT NULL OR photo_external_url IS NOT NULL)"
      : "photo IS NOT NULL";
  let cursor = "";
  let total = 0;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id FROM "${table}"
        WHERE photo_migrated_at IS NULL AND ${extPred} AND id > $1
        ORDER BY id LIMIT ${PHOTO_SCAN_BATCH}`,
      [cursor],
    );
    if (rows.length === 0) break;
    for (const r of rows) await enqueuePhoto(table, r.id as string);
    total += rows.length;
    cursor = rows[rows.length - 1].id as string;
    console.log(`[enqueue] ${table}: queued ${total} photo jobs so far`);
    if (rows.length < PHOTO_SCAN_BATCH) break;
  }
  return total;
}

async function main() {
  const token = await acquireLock(LOCK_KEY, LOCK_TTL);
  if (!token) {
    console.error("[enqueue] another producer holds the lock — exiting.");
    process.exit(1);
  }
  const stopHeartbeat = startHeartbeat(LOCK_KEY, token, LOCK_TTL, HEARTBEAT_MS);
  try {
    if (process.env.PRODUCER_SKIP_TABLES !== "1") {
      console.log("[enqueue] phase 1: tables");
      await enqueueAllTables();
      console.log("[enqueue] waiting for table migrations to finish...");
      await waitForTables();
      console.log("[enqueue] tables done.");
    }
    if (process.env.PRODUCER_SKIP_PHOTOS !== "1") {
      console.log("[enqueue] phase 2: photos");
      const a = await enqueuePendingPhotos("missing_persons");
      const b = await enqueuePendingPhotos("reports");
      console.log(`[enqueue] queued ${a + b} photo jobs total.`);
    }
  } finally {
    stopHeartbeat();
    await releaseLock(LOCK_KEY, token);
    await closePools();
    getRedis().disconnect();
  }
  console.log("[enqueue] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[enqueue] fatal:", err);
  process.exit(1);
});
