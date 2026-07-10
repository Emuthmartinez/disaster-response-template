/**
 * Aplicador de migraciones de esquema (drizzle-kit migrate, en runtime).
 *
 * Corre como servicio one-shot de docker-compose (`migrate` en
 * docker-compose.prod.yml, `migrate-seed` en docker-compose.yml), gateado
 * ANTES de que el backend arranque (`depends_on: migrate` con condición de
 * completed). Usa el `migrate()` de drizzle-orm (dep de runtime), NO el CLI
 * drizzle-kit (que es devDependency y no está en la imagen). Aplica solo las
 * migraciones pendientes y las registra en la tabla `__drizzle_migrations`,
 * así que es idempotente y re-ejecutable.
 *
 * Va en la imagen `worker` (que lleva el node_modules completo + tsx + pg). El
 * DB destino es Postgres por TCP, así que usamos el driver node-postgres.
 *
 * Env: DATABASE_URL (el Postgres de este deployment).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || "infra/db/migrations";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada (app DB destino).");

  // Guardas anti-outage (estándar de migraciones seguras en Postgres): si un
  // ALTER no consigue su lock de inmediato porque hay una query larga en curso,
  // SIN esto la migración espera indefinidamente y BLOQUEA todas las lecturas/
  // escrituras de esa tabla -> caída autoinfligida. Con lock_timeout la migración
  // falla rápido (y el Job gateado aborta el deploy ANTES del roll, así que prod
  // queda intacto). statement_timeout acota DDL desbocado.
  //
  // Se pasan en la config del Pool (ms) — node-postgres los aplica a CADA
  // conexión vía parámetros de arranque, así que valen sin depender de que un
  // `SET` corra en la sesión correcta que use migrate(). lock_timeout (3s) DEBE
  // ser < statement_timeout (60s): si statement_timeout fuera <=, saltaría
  // primero y lock_timeout nunca aplicaría. Override por env si hace falta.
  const lockTimeoutMs = Number(process.env.MIGRATE_LOCK_TIMEOUT_MS) || 3_000;
  const statementTimeoutMs =
    Number(process.env.MIGRATE_STATEMENT_TIMEOUT_MS) || 60_000;
  const pool = new Pool({
    connectionString: url,
    max: 1,
    lock_timeout: lockTimeoutMs,
    statement_timeout: statementTimeoutMs,
  });
  try {
    console.log(
      `[migrate] lock_timeout=${lockTimeoutMs}ms statement_timeout=${statementTimeoutMs}ms`,
    );
    const db = drizzle(pool);
    console.log(`[migrate] aplicando migraciones desde ${MIGRATIONS_DIR}...`);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("[migrate] listo. Esquema al día.");
  } finally {
    await pool.end();
  }

  // Seed idempotente del motor de auth (capacidades + rol admin + superadmin).
  // Va DESPUÉS de migrate, en el mismo Job gateado: schema y datos base llegan
  // juntos antes del roll de la app. Usa @/db (su propio Pool); por eso cerramos
  // el pool de migración antes.
  const { seedAuth } = await import("@/auth/seed");
  await seedAuth();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] fatal:", err);
    process.exit(1);
  });
