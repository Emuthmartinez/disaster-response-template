/**
 * migrate-table job: copy ALL rows of one table from Neon (source) into the
 * Hetzner `app` DB (target), idempotently and re-runnably.
 *
 * - Introspects the source's columns at runtime (copies whatever exists).
 * - Reads in keyset-paginated batches ordered by the conflict key (stable,
 *   no LIMIT/OFFSET drift) — handles the 78k missing_persons table memory-safely.
 * - Writes with INSERT ... ON CONFLICT (key) DO UPDATE / DO NOTHING per policy.
 * - Re-running pulls new/changed rows and updates existing ones, never dupes
 *   (this is the "move multiple syncs" requirement).
 */
import type { Pool } from "pg";
import { sourcePool, targetPool } from "../db";
import type { TableSpec } from "../tables";

const BATCH = 500;

interface SourceColumn {
  name: string;
  /** Postgres type as reported by format_type (e.g. text, bigint, jsonb). */
  type: string;
  notNull: boolean;
}

/**
 * Source columns with their types (format_type gives a CREATE-ready type string,
 * resolving sequences/arrays/etc). Ordinal order so the target matches layout.
 */
async function sourceColumns(src: Pool, table: string): Promise<SourceColumn[]> {
  const { rows } = await src.query(
    `select a.attname as name,
            format_type(a.atttypid, a.atttypmod) as type,
            a.attnotnull as not_null
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1
        and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [table],
  );
  return rows.map((r) => ({
    name: r.name as string,
    type: r.type as string,
    notNull: r.not_null as boolean,
  }));
}

const ident = (c: string) => `"${c.replace(/"/g, '""')}"`;

/**
 * Make the target schema match the source: create the table if missing and add
 * any columns it lacks (handles both "table doesn't exist" and column drift like
 * donations.status). No NOT NULL/defaults on add — we copy real data anyway and
 * don't want to block backfills. Then ensure the conflict key has a unique
 * index so `ON CONFLICT (key)` resolves. Idempotent / re-runnable.
 */
async function ensureTargetSchema(
  tgt: Pool,
  table: string,
  cols: SourceColumn[],
  conflict: string[],
): Promise<void> {
  const defs = cols
    .map((c) => `${ident(c.name)} ${c.type}${c.notNull ? " NOT NULL" : ""}`)
    .join(", ");
  await tgt.query(`CREATE TABLE IF NOT EXISTS ${ident(table)} (${defs})`);
  // Add any columns missing on a pre-existing target table (NULLable, no default).
  for (const c of cols) {
    await tgt.query(
      `ALTER TABLE ${ident(table)} ADD COLUMN IF NOT EXISTS ${ident(c.name)} ${c.type}`,
    );
  }
  // ON CONFLICT (key) needs a unique constraint/index on exactly those columns.
  const idxName = `mig_uniq_${table}_${conflict.join("_")}`.slice(0, 63);
  await tgt.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${ident(idxName)} ` +
      `ON ${ident(table)} (${conflict.map(ident).join(", ")})`,
  );
}

async function suppressedLegacyIds(tgt: Pool, table: string): Promise<Set<string>> {
  if (table !== "missing_persons") return new Set();
  const exists = await tgt.query(
    "SELECT to_regclass('public.missing_person_suppressions') AS table_name",
  );
  if (!exists.rows[0]?.table_name) return new Set();
  const { rows } = await tgt.query(
    "SELECT legacy_id FROM missing_person_suppressions",
  );
  return new Set(rows.map((row) => String(row.legacy_id)));
}

export interface MigrateTableResult {
  table: string;
  read: number;
  upserted: number;
}

export async function migrateTable(spec: TableSpec): Promise<MigrateTableResult> {
  const src = sourcePool();
  const tgt = targetPool();

  const srcCols = await sourceColumns(src, spec.name);
  if (srcCols.length === 0) {
    // Table doesn't exist in source — nothing to copy. (Target may still have it.)
    return { table: spec.name, read: 0, upserted: 0 };
  }
  // Mirror the source schema onto the target before inserting (create table /
  // add missing columns / ensure the conflict-key unique index).
  await ensureTargetSchema(tgt, spec.name, srcCols, spec.conflict);
  const suppressedIds = await suppressedLegacyIds(tgt, spec.name);

  const cols = srcCols.map((c) => c.name);
  // Only conflict-update columns that aren't part of the key.
  const updateCols = cols.filter((c) => !spec.conflict.includes(c));

  const colList = cols.map(ident).join(", ");
  const keyList = spec.conflict.map(ident).join(", ");
  const onConflict =
    spec.policy === "ignore" || updateCols.length === 0
      ? `ON CONFLICT (${keyList}) DO NOTHING`
      : `ON CONFLICT (${keyList}) DO UPDATE SET ` +
        updateCols.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ");

  const orderBy = spec.conflict.map(ident).join(", ");

  let read = 0;
  let upserted = 0;
  // Keyset cursor: the last conflict-key tuple we read.
  let cursor: unknown[] | null = null;


  while (true) {
    // WHERE (k1,k2) > ($1,$2) using row-value comparison for a clean keyset.
    const where =
      cursor === null
        ? ""
        : `WHERE (${keyList}) > (${spec.conflict.map((_, i) => `$${i + 1}`).join(", ")})`;
    const params = cursor === null ? [] : cursor;
    const { rows } = await src.query(
      `SELECT ${colList} FROM "${spec.name}" ${where} ORDER BY ${orderBy} LIMIT ${BATCH}`,
      params,
    );
    if (rows.length === 0) break;
    read += rows.length;
    const insertRows = rows.filter(
      (row) => !suppressedIds.has(String((row as Record<string, unknown>).id)),
    );

    // Build a single multi-row INSERT for the batch.
    if (insertRows.length > 0) {
      const values: unknown[] = [];
      const tuples: string[] = [];
      insertRows.forEach((row, r) => {
        const ph = cols.map((_, c) => `$${r * cols.length + c + 1}`);
        tuples.push(`(${ph.join(", ")})`);
        cols.forEach((c) => values.push((row as Record<string, unknown>)[c]));
      });
      const insert = `INSERT INTO "${spec.name}" (${colList}) VALUES ${tuples.join(
        ", ",
      )} ${onConflict}`;
      const res = await tgt.query(insert, values);
      upserted += res.rowCount ?? 0;
    }

    const last = rows[rows.length - 1] as Record<string, unknown>;
    cursor = spec.conflict.map((k) => last[k]);
    if (rows.length < BATCH) break;
  }

  return { table: spec.name, read, upserted };
}
