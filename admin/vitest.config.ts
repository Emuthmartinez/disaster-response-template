import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Espeja el alias @/* → ./* de TypeScript para que vitest lo resuelva.
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.resolve(import.meta.dirname, "./tests/setup.ts")],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
