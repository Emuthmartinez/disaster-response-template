/**
 * Acceso a la base con Drizzle ORM sobre Postgres vía node-postgres (solo TCP).
 * El esquema vive en infra/db/schema.ts (fuente de verdad, compartida con las
 * migraciones drizzle-kit).
 *
 * DATABASE_URL apunta a tu instancia de Postgres. getDb() es síncrono (crear
 * el Pool no hace I/O; la conexión real es perezosa en la primera query).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../infra/db/schema.js";
import { env } from "@/config/env";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  _db = drizzle(pool, { schema });
  return _db;
}

/**
 * Guard heredado del app Next (lib/db.ts): true cuando hay DATABASE_URL. En el
 * backend SIEMPRE la hay (validada en config/env, fail-fast), pero el código de
 * sync conserva sus ramas `if (!hasDbEnv())` para preservar la semántica exacta.
 */
export function hasDbEnv(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
