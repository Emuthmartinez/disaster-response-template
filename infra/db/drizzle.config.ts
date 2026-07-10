/**
 * Config de drizzle-kit — genera migraciones `.sql` a partir de `./schema.ts`.
 *
 * Uso: `cd backend && npm run db:generate` (ver package.json: invoca
 * `drizzle-kit generate --config ../infra/db/drizzle.config.ts`). Requiere
 * DATABASE_URL solo para introspección opcional; generate() no necesita una
 * conexión viva.
 */
// Sin `import { defineConfig } from "drizzle-kit"`: este archivo vive fuera de
// backend/node_modules y un import en tiempo de carga no resuelve desde aquí.
// drizzle-kit acepta un objeto plano como default export.
export default {
  // Rutas relativas al CWD de invocación (backend/), no a este archivo:
  // `cd backend && npm run db:generate`.
  schema: "../infra/db/schema.ts",
  out: "../infra/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
};
