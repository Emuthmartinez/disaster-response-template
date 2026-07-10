/**
 * Postgres pools used by this worker process.
 *
 * `targetPool` is this app's own Postgres (DATABASE_URL) — it backs normal,
 * always-on worker jobs (e.g. the hub-federation ingest/image jobs), not just
 * migration tooling.
 *
 * `sourcePool` exists ONLY for the optional, one-time data-import tooling in
 * `worker/enqueue.ts` + `worker/jobs/migrateTable.ts` (copy rows from some
 * OTHER, prior Postgres database into this app's own DB — useful once, if
 * ever, when standing up this template from an existing dataset). It is not
 * used by anything in the normal request/worker path and nothing in this
 * template calls it unless you run `enqueue.ts` yourself. Set
 * `NEON_DATABASE_URL` to whatever Postgres you're importing FROM — the name
 * is a holdover from this tooling's original use case, not a requirement that
 * your source DB is actually hosted on Neon.
 *
 * Both are plain TCP Postgres, so we use node-postgres (pg) for both — same
 * BIGINT-as-number parsing as lib/db.ts so epoch-ms values stay numeric.
 */
import { Pool, types } from "pg";

// BIGINT (oid 20) -> JS number (epoch-ms are within Number.MAX_SAFE_INTEGER).
types.setTypeParser(20, (v: string) => parseInt(v, 10));

let _target: Pool | null = null;
let _source: Pool | null = null;

export function targetPool(): Pool {
  if (_target) return _target;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (target app DB) not set");
  // max ≥ suma de concurrencias de los workers que pegan al target (audit M-4).
  // Ya no se retiene conexión a través de I/O de red (ver migratePhoto), pero
  // varias colas concurrentes igual necesitan holgura. Tunable por env.
  const max = Number(process.env.TARGET_POOL_MAX || 16);
  _target = new Pool({ connectionString: url, max });
  return _target;
}

/**
 * Solo para la herramienta de importación única (worker/enqueue.ts). No se usa
 * en ningún flujo normal de la app — nadie llama a esta función salvo que tú
 * mismo corras ese script de migración puntual.
 */
export function sourcePool(): Pool {
  if (_source) return _source;
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL (source DB you're importing from) not set");
  // Asume que la URL ya trae sslmode=require si la fuente lo exige (p.ej. Neon).
  _source = new Pool({ connectionString: url, max: 4 });
  return _source;
}

export async function closePools(): Promise<void> {
  await Promise.allSettled([_target?.end(), _source?.end()]);
  _target = null;
  _source = null;
}
