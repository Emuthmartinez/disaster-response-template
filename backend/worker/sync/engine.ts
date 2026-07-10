/**
 * Motor de sincronización: corre un adaptador, normaliza y hace upsert por el
 * camino único (`upsertExternalMissing`). Acumula contadores y nunca deja que
 * el fallo de una fuente tumbe a las demás.
 *
 * Ver docs/rfcs/0001-sincronizacion-fuentes.md
 */

import { hasDbEnv } from "../../src/db";
import { upsertExternalMissingBatch } from "../../src/services/missing";
import type { SourceAdapter, SyncResult, ExternalPerson } from "./types";
import { enabledSources, getSource } from "./sources";
import { getSyncCursor, setSyncCursor, recordSyncRun, type SyncTrigger } from "./state";

const DEFAULT_USER_AGENT =
  "DisasterResponseTemplate/1.0 (+https://example.org)";

/** Páginas máximas por corrida chunked (freno duro). */
const DEFAULT_PAGES_PER_RUN = 50;
/** Presupuesto de tiempo por corrida chunked (deja margen al maxDuration). */
const DEFAULT_TIME_BUDGET_MS = 200_000;
/** Pausa entre páginas para ser gentiles con la fuente. */
const INTER_PAGE_DELAY_MS = 200;
/** Cinturón anti-bucle si la fuente no reporta totalPages. */
const HARD_PAGE_CAP = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunOptions {
  dryRun?: boolean;
  /** Tope de registros a procesar por fuente. */
  limit?: number;
  /** Origen de la corrida (para la bitácora). */
  trigger?: SyncTrigger;
  /** Filtro de estado (solo fuentes que lo soportan). */
  statusFilter?: "found" | "missing";
}

export interface ChunkOptions {
  /** Máximo de páginas a procesar en esta corrida. */
  pagesPerRun?: number;
  /** Presupuesto de tiempo (ms): se corta al excederlo. */
  timeBudgetMs?: number;
  /** Origen de la corrida (para la bitácora). */
  trigger?: SyncTrigger;
  /** Filtro de estado (solo fuentes que lo soportan). */
  statusFilter?: "found" | "missing";
}

function userAgent(): string {
  return process.env.SYNC_USER_AGENT || DEFAULT_USER_AGENT;
}

/** Sincroniza una sola fuente. Nunca lanza: empaqueta el fallo en el resultado. */
export async function runSync(
  adapter: SourceAdapter,
  opts: RunOptions = {},
): Promise<SyncResult> {
  const dryRun = Boolean(opts.dryRun);
  const startedAt = Date.now();
  const base: SyncResult = {
    source: adapter.id,
    ok: false,
    dryRun,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
  };

  if (!dryRun && !hasDbEnv()) {
    return finalize({
      ...base,
      error: "DATABASE_URL no configurada: la sincronización necesita DB.",
    });
  }

  try {
    const people = await adapter.fetchAll({
      userAgent: userAgent(),
      limit: opts.limit,
      statusFilter: opts.statusFilter,
    });
    base.fetched = people.length;

    if (dryRun) {
      // Sin escribir: contamos válidos (se procesarían) vs inválidos (se saltan).
      for (const p of people) {
        if (p.name?.trim() && p.externalId?.trim() && p.source?.trim()) {
          base.inserted++;
        } else {
          base.skipped++;
        }
      }
      return finalize({ ...base, ok: true });
    }

    const r = await upsertExternalMissingBatch(people);
    base.inserted = r.inserted;
    base.updated = r.updated;
    base.skipped = r.skipped;
    base.errors = r.errors;

    return finalize({ ...base, ok: true });
  } catch (err) {
    return finalize({
      ...base,
      error: err instanceof Error ? err.message : "Error desconocido.",
    });
  }
}

/** Sincroniza todas las fuentes habilitadas (o las indicadas en `sourceIds`). */
export async function runAllSources(
  opts: RunOptions & { sourceIds?: string[] } = {},
): Promise<SyncResult[]> {
  const adapters = opts.sourceIds?.length
    ? opts.sourceIds
        .map((id) => getSource(id))
        .filter((a): a is SourceAdapter => Boolean(a))
    : enabledSources();

  const trigger: SyncTrigger = opts.trigger ?? "manual";
  const results: SyncResult[] = [];
  for (const adapter of adapters) {
    const result = await runSync(adapter, opts);
    if (!result.dryRun) await recordSyncRun(result, trigger);
    results.push(result);
  }
  return results;
}

/**
 * Sincroniza una fuente por CHUNKS: procesa un rango acotado de páginas (freno
 * por `pagesPerRun` y por `timeBudgetMs`, lo que llegue primero), persiste el
 * cursor en `sync_state` y reanuda en la próxima corrida. Al pasar la última
 * página, da la vuelta a la página 1 (re-scan cíclico). Idempotente.
 *
 * Requiere que el adaptador implemente `fetchPage`. Nunca lanza.
 */
export async function runSyncChunked(
  adapter: SourceAdapter,
  opts: ChunkOptions = {},
): Promise<SyncResult> {
  const startedAt = Date.now();
  const base: SyncResult = {
    source: adapter.id,
    ok: false,
    dryRun: false,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
  };

  if (!hasDbEnv()) {
    return finalize({ ...base, error: "DATABASE_URL no configurada." });
  }
  if (!adapter.fetchPage) {
    return finalize({
      ...base,
      error: `La fuente ${adapter.id} no soporta fetchPage (modo chunked).`,
    });
  }

  const pagesPerRun = Math.max(1, Math.trunc(opts.pagesPerRun ?? DEFAULT_PAGES_PER_RUN));
  const timeBudgetMs = Math.max(1_000, Math.trunc(opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS));
  const ua = userAgent();

  try {
    const cursor = await getSyncCursor(adapter.id);
    let totalPages = cursor.totalPages;
    // Si el cursor quedó más allá del total conocido, reinicia el ciclo.
    let page =
      totalPages && cursor.nextPage > totalPages ? 1 : cursor.nextPage;
    const fromPage = page;

    const seen = new Set<string>(); // dedup de solapes dentro de esta corrida
    let pagesProcessed = 0;
    let cycleCompleted = false;
    let lastPage = page - 1;
    let runError: string | undefined;

    while (
      pagesProcessed < pagesPerRun &&
      Date.now() - startedAt < timeBudgetMs &&
      page <= HARD_PAGE_CAP
    ) {
      // Error de una página: cortamos la corrida pero NO perdemos el progreso
      // (el cursor se persiste abajo en la última página completada). Reanudar
      // es seguro e idempotente.
      let people: ExternalPerson[];
      let tp: number | null;
      try {
        const res = await adapter.fetchPage(page, {
          userAgent: ua,
          statusFilter: opts.statusFilter,
        });
        people = res.people;
        tp = res.totalPages;
      } catch (err) {
        runError = err instanceof Error ? err.message : "Error al traer página.";
        break;
      }
      if (typeof tp === "number" && tp > 0) totalPages = tp;
      base.fetched += people.length;

      // Página vacía => llegamos al final: cerrar ciclo.
      if (people.length === 0) {
        cycleCompleted = true;
        break;
      }

      const fresh = people.filter((p) => {
        if (seen.has(p.externalId)) return false;
        seen.add(p.externalId);
        return true;
      });
      try {
        const r = await upsertExternalMissingBatch(fresh);
        base.inserted += r.inserted;
        base.updated += r.updated;
        base.skipped += r.skipped;
        base.errors += r.errors;
      } catch (err) {
        runError = err instanceof Error ? err.message : "Error al escribir página.";
        break;
      }

      lastPage = page;
      pagesProcessed++;
      page++;

      // Pasamos la última página conocida => cerrar ciclo y dar la vuelta.
      if (totalPages && page > totalPages) {
        cycleCompleted = true;
        break;
      }
      await sleep(INTER_PAGE_DELAY_MS);
    }

    // Persistimos el cursor en la próxima página NO procesada (progreso guardado
    // aunque la corrida se haya cortado por error o por presupuesto).
    const nextPage = cycleCompleted ? 1 : lastPage + 1;
    await setSyncCursor(adapter.id, { nextPage, totalPages }, { cycleCompleted });

    return finalize({
      ...base,
      ok: !runError,
      error: runError,
      pagesProcessed,
      fromPage,
      toPage: lastPage,
      nextPage,
      cycleCompleted,
    });
  } catch (err) {
    return finalize({
      ...base,
      error: err instanceof Error ? err.message : "Error desconocido.",
    });
  }
}

/**
 * Corre todas las fuentes habilitadas en modo chunked. Las que no soportan
 * `fetchPage` caen a `runSync` completo (p. ej. un feed que devuelve todo junto).
 */
export async function runAllSourcesChunked(
  opts: ChunkOptions & { sourceIds?: string[] } = {},
): Promise<SyncResult[]> {
  const adapters = opts.sourceIds?.length
    ? opts.sourceIds
        .map((id) => getSource(id))
        .filter((a): a is SourceAdapter => Boolean(a))
    : enabledSources();

  const trigger: SyncTrigger = opts.trigger ?? "manual";
  const results: SyncResult[] = [];
  for (const adapter of adapters) {
    const result = adapter.fetchPage
      ? await runSyncChunked(adapter, opts)
      : await runSync(adapter);
    await recordSyncRun(result, trigger);
    results.push(result);
  }
  return results;
}

function finalize(r: SyncResult): SyncResult {
  const finishedAt = Date.now();
  return { ...r, finishedAt, durationMs: finishedAt - r.startedAt };
}
