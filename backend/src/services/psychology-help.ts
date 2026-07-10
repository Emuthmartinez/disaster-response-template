/**
 * Service del contador de clics de "ayuda psicológica". Port directo de
 * lib/click-counters.ts (rama hasDbEnv), preservando el CTE atómico de dedup por
 * IP + incremento + lectura en una sola sentencia (escape `sql`).
 *
 * El dedup recibe el HASH de IP (no la IP cruda) — el route pasa hashIp(req).
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { clickCounters, clickCounterDedup } = schema;

const PSYCHOLOGY_HELP_KEY = "psychology_help";

export async function getPsychologyHelpClickCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: clickCounters.count })
    .from(clickCounters)
    .where(eq(clickCounters.key, PSYCHOLOGY_HELP_KEY));
  return Number(rows[0]?.count ?? 0);
}

/** Incrementa el contador una vez por IP (hash). Devuelve el total resultante. */
export async function incrementPsychologyHelpClick(
  ipKey: string,
): Promise<number> {
  const db = await getDb();
  // Aseguramos primero que la fila base del contador exista.
  await db
    .insert(clickCounters)
    .values({ key: PSYCHOLOGY_HELP_KEY, count: 0 })
    .onConflictDoNothing({ target: clickCounters.key });

  // Dedup por IP + incremento + lectura del total en UNA sentencia (CTE atómico):
  //  - IP nueva → `ins` trae fila → `upd` incrementa y devuelve el nuevo total.
  //  - IP repite → `ins` vacío → `upd` no corre → caemos al total actual.
  const result = await db.execute(sql`
    WITH ins AS (
      INSERT INTO ${clickCounterDedup} (${clickCounterDedup.counterKey}, ${clickCounterDedup.ipHash}, ${clickCounterDedup.createdAt})
      VALUES (${PSYCHOLOGY_HELP_KEY}, ${ipKey}, ${Date.now()})
      ON CONFLICT DO NOTHING
      RETURNING ${clickCounterDedup.counterKey}
    ),
    upd AS (
      UPDATE ${clickCounters} SET ${clickCounters.count} = ${clickCounters.count} + 1
      WHERE ${clickCounters.key} = ${PSYCHOLOGY_HELP_KEY} AND EXISTS (SELECT 1 FROM ins)
      RETURNING ${clickCounters.count}
    )
    SELECT COALESCE(
      (SELECT count FROM upd),
      (SELECT ${clickCounters.count} FROM ${clickCounters} WHERE ${clickCounters.key} = ${PSYCHOLOGY_HELP_KEY})
    ) AS count
  `);
  const rows = (Array.isArray(result) ? result : result.rows) as {
    count: number;
  }[];
  return Number(rows[0]?.count ?? 0);
}
