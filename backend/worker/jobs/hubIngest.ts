/**
 * Job de ingesta del hub: pagina un tipo del hub y hace upsert idempotente en
 * su tabla `hub_*`. Reanudable vía el cursor en `hub_sync_state`.
 * Ver docs/modules.md (sección ENABLE_HUB_FEDERATION).
 *
 * Modos:
 *   - "incremental": arranca desde el cursor guardado (solo trae registros más
 *     nuevos que la última corrida). Barato; lo dispara el scheduler cada 5 min.
 *   - "backfill" / "reconcile": arranca desde el inicio (cursor=null) y recorre
 *     TODO el tipo. backfill = primera carga; reconcile = re-scan periódico que
 *     capta ediciones in-place (status/foto), invisibles al incremental porque
 *     el `since` del hub es por created_at, no updated_at.
 *
 * Cada corrida está acotada por pagesPerRun + timeBudgetMs (igual que el motor
 * de sync nativo): hace checkpoint del cursor y la siguiente corrida continúa.
 * El upsert es por hub_id (UNIQUE) -> reejecutar es no-op para filas iguales.
 * Encola un job de imagen por cada registro con foto pendiente.
 */
import { randomUUID } from "crypto";
import { targetPool } from "../db";
import {
  fetchHubPage,
  isOwnSource,
  mapRecord,
  HUB_HAS_PHOTO,
  HUB_TABLE,
  type HubType,
} from "../hub/config";

export type IngestMode = "incremental" | "backfill" | "reconcile";

export interface HubIngestResult {
  type: HubType;
  mode: IngestMode;
  fetched: number;
  upserted: number;
  skippedOwn: number;
  imagesQueued: number;
  pages: number;
  cycleCompleted: boolean;
  nextCursor: string | null;
}

const PAGES_PER_RUN = Number(process.env.HUB_PAGES_PER_RUN || 50);
const TIME_BUDGET_MS = Number(process.env.HUB_TIME_BUDGET_MS || 200_000);
const INTER_PAGE_DELAY_MS = Number(process.env.HUB_INTER_PAGE_DELAY_MS || 250);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Inyectado por queues.ts para evitar import circular (job -> queue -> job).
type EnqueueImage = (type: HubType, hubId: string) => Promise<unknown>;
let enqueueImage: EnqueueImage = async () => {};
export function setImageEnqueuer(fn: EnqueueImage) {
  enqueueImage = fn;
}

async function getCursor(type: HubType): Promise<string | null> {
  const { rows } = await targetPool().query(
    `SELECT cursor FROM hub_sync_state WHERE type = $1`,
    [type],
  );
  return rows[0]?.cursor ?? null;
}

async function saveCursor(
  type: HubType,
  cursor: string | null,
  cycleCompleted: boolean,
): Promise<void> {
  const now = Date.now();
  await targetPool().query(
    `INSERT INTO hub_sync_state (type, cursor, last_run_at, cycle_completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (type) DO UPDATE SET
       cursor = EXCLUDED.cursor,
       last_run_at = EXCLUDED.last_run_at,
       cycle_completed_at = COALESCE(EXCLUDED.cycle_completed_at, hub_sync_state.cycle_completed_at)`,
    [type, cursor, now, cycleCompleted ? now : null],
  );
}

/** Upsert por hub_id de un lote ya mapeado. Devuelve los hub_id con foto pendiente. */
async function upsertBatch(
  type: HubType,
  rows: Record<string, unknown>[],
): Promise<{ upserted: number; pendingPhoto: string[] }> {
  if (rows.length === 0) return { upserted: 0, pendingPhoto: [] };
  const table = HUB_TABLE[type];
  const hasPhoto = HUB_HAS_PHOTO[type];
  const now = Date.now();
  const pendingPhoto: string[] = [];
  const pool = targetPool();

  // Upsert fila por fila dentro de una transacción: el volumen por página es
  // pequeño (<=200) y así reusamos el mapeo dinámico de columnas sin construir
  // un INSERT multivalor frágil. Idempotente por el índice único de hub_id.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const data of rows) {
      const cols = Object.keys(data);
      const vals = cols.map((c) => data[c]);
      // columnas + placeholders dinámicos
      const allCols = ["id", ...cols, "ingested_at", "updated_at"];
      const allVals = [randomUUID(), ...vals, now, now];
      const ph = allVals.map((_, i) => `$${i + 1}`).join(", ");
      // En conflicto de hub_id, actualiza todo menos id/ingested_at (preserva el
      // primer id local y cuándo se trajo por primera vez).
      const updates = [...cols, "updated_at"]
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(", ");
      await client.query(
        `INSERT INTO "${table}" (${allCols.map((c) => `"${c}"`).join(", ")})
         VALUES (${ph})
         ON CONFLICT (hub_id) DO UPDATE SET ${updates}`,
        allVals,
      );
      if (hasPhoto && data.photo_external_url) {
        pendingPhoto.push(String(data.hub_id));
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { upserted: rows.length, pendingPhoto };
}

export async function hubIngest(
  type: HubType,
  mode: IngestMode,
): Promise<HubIngestResult> {
  const startedAt = Date.now();
  const res: HubIngestResult = {
    type,
    mode,
    fetched: 0,
    upserted: 0,
    skippedOwn: 0,
    imagesQueued: 0,
    pages: 0,
    cycleCompleted: false,
    nextCursor: null,
  };

  // incremental reanuda desde el cursor guardado; backfill/reconcile desde 0.
  let cursor: string | null = mode === "incremental" ? await getCursor(type) : null;

  while (res.pages < PAGES_PER_RUN && Date.now() - startedAt < TIME_BUDGET_MS) {
    const page = await fetchHubPage(type, cursor);
    res.fetched += page.reports.length;
    res.pages++;

    if (page.reports.length === 0) {
      res.cycleCompleted = true;
      break;
    }

    // Excluir nuestras propias fuentes (anti-eco) y mapear.
    const mapped: Record<string, unknown>[] = [];
    for (const r of page.reports) {
      if (isOwnSource(r.source)) {
        res.skippedOwn++;
        continue;
      }
      mapped.push(mapRecord(type, r));
    }

    const { upserted, pendingPhoto } = await upsertBatch(type, mapped);
    res.upserted += upserted;
    // Encolar imágenes en paralelo: cada enqueue es un round-trip independiente
    // a Redis (audit B-3). El INTER_PAGE_DELAY_MS domina el wall-clock igual.
    await Promise.all(pendingPhoto.map((hubId) => enqueueImage(type, hubId)));
    res.imagesQueued += pendingPhoto.length;

    cursor = page.next_cursor;
    // Guardamos el cursor en cada página: si se corta por presupuesto/error, la
    // próxima corrida continúa exactamente desde aquí (incremental) o avanza el
    // checkpoint del backfill.
    if (mode !== "reconcile") await saveCursor(type, cursor, false);

    if (!cursor) {
      res.cycleCompleted = true;
      break;
    }
    await sleep(INTER_PAGE_DELAY_MS);
  }

  res.nextCursor = cursor;
  // En reconcile no movemos el cursor incremental (solo refresca filas); marcamos
  // el cierre de ciclo cuando se completó el barrido.
  if (mode === "reconcile" && res.cycleCompleted) {
    await saveCursor(type, await getCursor(type), true);
  }
  return res;
}
