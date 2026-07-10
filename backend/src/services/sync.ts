/**
 * Service de sincronización de fuentes externas. La LÓGICA pesada (fetch de
 * feeds, normalización, upsert) corre en el WORKER; este service solo:
 *   - valida la fuente contra el catálogo cerrado (espeja lib/sync/sources),
 *   - encola jobs (productor BullMQ, ver @/lib/queues) y devuelve jobIds,
 *   - lee el estado/cursor de sync desde la DB (port de lib/sync/state.ts).
 *
 * El route nunca toca la DB ni la cola directo: pasa por aquí.
 */
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  cancelSourceSyncJobs,
  enqueueSourceSync,
  type SyncMode,
} from "@/lib/queues";

const { syncState, syncRuns } = schema;

// Catálogo de fuentes (ids; espeja ALL_SOURCES de worker/sync/sources). El
// fetch/normalize de cada una vive en el worker; aquí solo necesitamos validar
// id. Cada fuente es OFF por defecto (gating): esta lista solo incluye la que
// esté habilitada por su propio flag `ENABLE_*`. Ninguna fuente real de un
// tercero viene registrada por defecto en este template — solo el worked
// example (`example-source`, ver worker/sync/sources/example-source.ts).
function allSourceIds(): readonly string[] {
  return process.env.ENABLE_EXAMPLE_SOURCE === "true" ? ["example-source"] : [];
}

/** Ids habilitados según SYNC_SOURCES (csv); todos los registrados si no se define. */
export function enabledSourceIds(): string[] {
  const all = allSourceIds();
  const raw = (process.env.SYNC_SOURCES ?? "").trim();
  if (!raw) return [...all];
  const ids = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return all.filter((id) => ids.has(id));
}

/** True si el id es una fuente registrada (habilitada por su flag). */
export function isKnownSource(id: string): boolean {
  return allSourceIds().includes(id);
}

export interface RunOptions {
  source?: string | null;
  mode: SyncMode;
  dryRun?: boolean;
  limit?: number;
  pagesPerRun?: number;
  statusFilter?: "found" | "missing";
}

/** Encola un job de sync por cada fuente (una si `source` se pasa). */
export async function runSync(opts: RunOptions): Promise<string[]> {
  const ids = opts.source ? [opts.source] : enabledSourceIds();
  return Promise.all(
    ids.map((sourceId) =>
      enqueueSourceSync({
        sourceId,
        mode: opts.mode,
        dryRun: opts.dryRun,
        limit: opts.limit,
        pagesPerRun: opts.pagesPerRun,
        statusFilter: opts.statusFilter,
      }),
    ),
  );
}

/** Encola un job chunked por fuente habilitada (camino del cron). */
export async function runCron(): Promise<string[]> {
  return Promise.all(
    enabledSourceIds().map((sourceId) =>
      enqueueSourceSync({ sourceId, mode: "chunk" }),
    ),
  );
}

/**
 * Reinicia el cursor a la página 1 (re-escaneo desde el inicio). No destructivo.
 * Cancela jobs activos primero para que no pisen el cursor recién reseteado.
 */
export async function resetSyncCursor(source?: string): Promise<void> {
  await cancelSourceSyncJobs(source);
  const db = await getDb();
  const now = Date.now();
  const sources = source ? [source] : [...allSourceIds()];
  for (const src of sources) {
    await db
      .insert(syncState)
      .values({
        source: src,
        nextPage: 1,
        totalPages: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: syncState.source,
        set: {
          nextPage: 1,
          lastCycleCompletedAt: null,
          updatedAt: now,
        },
      });
  }
}

export interface SyncRunRow {
  source: string;
  trigger: string | null;
  ok: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  fromPage: number | null;
  toPage: number | null;
  nextPage: number | null;
  cycleCompleted: boolean | null;
  error: string | null;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
}

/** Últimas corridas (panel admin). Port de lib/sync/state.ts:listSyncRuns. */
export async function listSyncRuns(limit = 20): Promise<SyncRunRow[]> {
  const db = await getDb();
  const n = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = await db
    .select({
      source: syncRuns.source,
      trigger: syncRuns.trigger,
      ok: syncRuns.ok,
      fetched: syncRuns.fetched,
      inserted: syncRuns.inserted,
      updated: syncRuns.updated,
      skipped: syncRuns.skipped,
      errors: syncRuns.errors,
      fromPage: syncRuns.fromPage,
      toPage: syncRuns.toPage,
      nextPage: syncRuns.nextPage,
      cycleCompleted: syncRuns.cycleCompleted,
      error: syncRuns.error,
      durationMs: syncRuns.durationMs,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
    })
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(n);
  return rows.map((r) => ({
    source: String(r.source),
    trigger: r.trigger ?? null,
    ok: Boolean(r.ok),
    fetched: Number(r.fetched),
    inserted: Number(r.inserted),
    updated: Number(r.updated),
    skipped: Number(r.skipped),
    errors: Number(r.errors),
    fromPage: r.fromPage === null ? null : Number(r.fromPage),
    toPage: r.toPage === null ? null : Number(r.toPage),
    nextPage: r.nextPage === null ? null : Number(r.nextPage),
    cycleCompleted: r.cycleCompleted === null ? null : Boolean(r.cycleCompleted),
    error: r.error ?? null,
    durationMs: Number(r.durationMs),
    startedAt: Number(r.startedAt),
    finishedAt: Number(r.finishedAt),
  }));
}

export interface SyncStateRow {
  source: string;
  nextPage: number;
  totalPages: number | null;
  lastRunAt: number | null;
  lastCycleCompletedAt: number | null;
}

/** Cursor actual de cada fuente (panel admin). Port de listSyncState. */
export async function listSyncState(): Promise<SyncStateRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      source: syncState.source,
      nextPage: syncState.nextPage,
      totalPages: syncState.totalPages,
      lastRunAt: syncState.lastRunAt,
      lastCycleCompletedAt: syncState.lastCycleCompletedAt,
    })
    .from(syncState)
    .orderBy(syncState.source);
  return rows.map((r) => ({
    source: String(r.source),
    nextPage: Number(r.nextPage),
    totalPages: r.totalPages === null ? null : Number(r.totalPages),
    lastRunAt: r.lastRunAt === null ? null : Number(r.lastRunAt),
    lastCycleCompletedAt:
      r.lastCycleCompletedAt === null ? null : Number(r.lastCycleCompletedAt),
  }));
}
