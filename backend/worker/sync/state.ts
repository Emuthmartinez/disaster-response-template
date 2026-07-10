/**
 * Estado de sincronización por fuente: el cursor de página para la ejecución
 * por chunks. Ver docs/rfcs/0001-sincronizacion-fuentes.md §2.5.
 */

import { eq, desc, sql } from "drizzle-orm";
import { getDb, hasDbEnv, schema } from "../../src/db";
import type { SyncResult } from "./types";

const { syncState, syncRuns } = schema;

export interface SyncCursor {
  /** Próxima página a procesar (1-based). */
  nextPage: number;
  /** Último total de páginas conocido (null si aún no se sabe). */
  totalPages: number | null;
}

/** Lee el cursor de una fuente; si no existe, devuelve el inicial (página 1). */
export async function getSyncCursor(source: string): Promise<SyncCursor> {
  if (!hasDbEnv()) return { nextPage: 1, totalPages: null };
  const rows = await getDb()
    .select({ nextPage: syncState.nextPage, totalPages: syncState.totalPages })
    .from(syncState)
    .where(eq(syncState.source, source));
  if (rows.length === 0) return { nextPage: 1, totalPages: null };
  return {
    nextPage: Math.max(1, Number(rows[0].nextPage) || 1),
    totalPages: rows[0].totalPages === null ? null : Number(rows[0].totalPages),
  };
}

/** Persiste el cursor de una fuente (upsert). */
export async function setSyncCursor(
  source: string,
  cursor: SyncCursor,
  opts: { cycleCompleted?: boolean } = {},
): Promise<void> {
  if (!hasDbEnv()) return;
  const now = Date.now();
  const cycleAt = opts.cycleCompleted ? now : null;
  await getDb()
    .insert(syncState)
    .values({
      source,
      nextPage: cursor.nextPage,
      totalPages: cursor.totalPages,
      lastRunAt: now,
      lastCycleCompletedAt: cycleAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: {
        nextPage: sql`excluded.next_page`,
        totalPages: sql`excluded.total_pages`,
        lastRunAt: sql`excluded.last_run_at`,
        lastCycleCompletedAt: sql`COALESCE(excluded.last_cycle_completed_at, ${syncState.lastCycleCompletedAt})`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Reinicia el cursor a la página 1 (re-escaneo desde el inicio). No destructivo:
 * upsert para fuentes sin fila previa. Si se pasa `source`, solo esa.
 */
export async function resetSyncCursor(source?: string): Promise<void> {
  if (!hasDbEnv()) return;
  const now = Date.now();
  // Sin `source`: reinicia todas las fuentes REGISTRADAS (habilitadas por su
  // flag `ENABLE_*`), no una lista fija — el catálogo lo define ./sources.
  const { ALL_SOURCES } = await import("./sources");
  const sources = source ? [source] : ALL_SOURCES.map((s) => s.id);
  for (const src of sources) {
    await getDb()
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

export type SyncTrigger = "cron" | "manual";

/** Registra una corrida en la bitácora (best-effort: no rompe el sync si falla). */
export async function recordSyncRun(
  result: SyncResult,
  trigger: SyncTrigger,
): Promise<void> {
  if (!hasDbEnv()) return;
  try {
    // id es bigserial: se omite para que la secuencia lo asigne.
    await getDb().insert(syncRuns).values({
      source: result.source,
      trigger,
      ok: result.ok,
      fetched: result.fetched,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      fromPage: result.fromPage ?? null,
      toPage: result.toPage ?? null,
      nextPage: result.nextPage ?? null,
      cycleCompleted: result.cycleCompleted ?? null,
      error: result.error ?? null,
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    });
  } catch {
    // la observabilidad no debe tumbar el sync
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

/** Últimas corridas (para el panel admin). */
export async function listSyncRuns(limit = 20): Promise<SyncRunRow[]> {
  if (!hasDbEnv()) return [];
  const n = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = await getDb()
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

/** Cursor actual de cada fuente (para el panel admin). */
export async function listSyncState(): Promise<SyncStateRow[]> {
  if (!hasDbEnv()) return [];
  const rows = await getDb()
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
