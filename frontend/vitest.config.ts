import { defineConfig } from "vitest/config";

// Runner de pruebas unitarias para helpers deterministas (sin DB ni red).
// Ver issue #42. Las pruebas de integración con Postgres (issue #50) vivirán
// en su propia lane y no se incluyen aquí.
//
// `resolve.tsconfigPaths` resuelve el alias `@/*` de tsconfig.json de forma
// nativa (Vite 8+), sin plugins extra.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
