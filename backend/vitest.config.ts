import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Espeja el alias @/* de tsconfig para que los tests resuelvan como el server.
    alias: { "@": path.resolve(here, "src") },
  },
  test: {
    // Tests de integración pegan a Postgres/Valkey local → secuencial, sin
    // paralelismo entre archivos (comparten la misma DB sembrada).
    fileParallelism: false,
    include: ["test/**/*.test.ts", "eslint-rules/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
