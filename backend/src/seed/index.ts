/**
 * Seed de DEMO para desarrollo LOCAL únicamente.
 *
 * Seguridad (sin override):
 *  - Aborta si NODE_ENV === "production".
 *  - Aborta si el host de DATABASE_URL no es local (db | localhost | 127.0.0.1).
 *  - Anti-mezcla: si existe CUALQUIER fila no-demo (id sin prefijo DEMO-) en las
 *    tablas principales, aborta para no mezclar fixtures con un dump real.
 *
 * Idempotente: inserta con onConflictDoNothing (re-ejecutable sin duplicar).
 *
 *   npm run seed            # dentro del stack de docker compose (host = db)
 */
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { buildFixtures, DEMO_PREFIX } from "./fixtures";

const LOCAL_HOSTS = new Set(["db", "localhost", "127.0.0.1"]);

function assertLocalOnly(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[seed] NODE_ENV=production → abortado (solo dev local).");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[seed] DATABASE_URL no configurada.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("[seed] DATABASE_URL inválida.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[seed] host "${host}" no es local (permitidos: ${[...LOCAL_HOSTS].join(", ")}) → abortado.`,
    );
  }
  console.log(`[seed] destino local confirmado: ${host}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countNonDemo(db: any, table: any): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(sql`id NOT LIKE ${DEMO_PREFIX + "%"}`);
  return rows[0]?.n ?? 0;
}

async function main(): Promise<void> {
  assertLocalOnly();
  const db = getDb();

  // Anti-mezcla: ninguna de las tablas principales debe tener datos no-demo.
  const guarded: Array<[string, unknown]> = [
    ["reports", schema.reports],
    ["missing_persons", schema.missingPersons],
    ["hospitals", schema.hospitals],
    ["donations", schema.donations],
    ["chat_messages", schema.chatMessages],
  ];
  for (const [label, table] of guarded) {
    const n = await countNonDemo(db, table);
    if (n > 0) {
      // Anti-mezcla: ya hay un dump real cargado. Saltar el seed DEMO es lo
      // correcto (no es un fallo), así que salimos limpio en vez de romper el
      // `docker compose up`. Las migraciones + seed RBAC ya corrieron antes.
      console.log(
        `[seed] ${label} tiene ${n} fila(s) NO-demo (dump real). ` +
          `Omito el seed DEMO para no mezclar. (DB vacía o solo DEMO- para sembrar.)`,
      );
      return;
    }
  }

  const data = buildFixtures(Date.now());

  // Orden: hospitales antes que sus hijos (FK).
  await db.insert(schema.hospitals).values(data.hospitals).onConflictDoNothing();
  await db.insert(schema.hospitalPatients).values(data.patients).onConflictDoNothing();
  await db.insert(schema.hospitalSupplyStatuses).values(data.supplyStatuses).onConflictDoNothing();
  await db.insert(schema.hospitalSupplyNeeds).values(data.supplyNeeds).onConflictDoNothing();
  await db.insert(schema.reports).values(data.reports).onConflictDoNothing();
  await db.insert(schema.missingPersons).values(data.missing).onConflictDoNothing();
  await db.insert(schema.donations).values(data.donations).onConflictDoNothing();
  await db.insert(schema.chatMessages).values(data.chat).onConflictDoNothing();

  console.log(
    "[seed] listo:",
    JSON.stringify({
      hospitals: data.hospitals.length,
      patients: data.patients.length,
      supplyStatuses: data.supplyStatuses.length,
      supplyNeeds: data.supplyNeeds.length,
      reports: data.reports.length,
      missing: data.missing.length,
      donations: data.donations.length,
      chat: data.chat.length,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
