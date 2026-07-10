/**
 * ESLint flat-config del backend. Dos capas:
 *   1. Baseline: reglas recomendadas de JS + typescript-eslint (calidad general).
 *   2. Reglas de arquitectura LOCALES (eslint-rules/): convierten la guía de
 *      endpoints en restricciones ejecutables (capability/rate-limit/turnstile).
 *
 * Las reglas locales solo aplican a los archivos de rutas (routes/ + public-api/);
 * el resto del código solo recibe el baseline.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import local from "./eslint-rules/index.js";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "eslint-rules/**",
      "*.config.*",
      // Turnstile está temporalmente desactivado (return true) con su impl real
      // comentada (@security WIP); el lint de unused-vars pelearía con ese estado
      // intencional. Se reactivará junto con el captcha. Ver lib/turnstile.ts.
      "src/lib/turnstile.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Baseline para todo el TS del backend.
    files: ["src/**/*.ts", "worker/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      // Pragmatismo: el repo usa algún any puntual justificado (factory genérico).
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Reglas de arquitectura: donde se montan rutas. Incluye los módulos de
    // integración (DDD): su capa interface/http también declara rutas y debe
    // pasar el gate (rate-limit + guard de mutaciones).
    files: [
      "src/routes/**/*.ts",
      "src/public-api/**/*.ts",
      "src/modules/**/*.ts",
    ],
    plugins: { local },
    rules: {
      "local/require-rate-limit": "error",
      "local/require-capability-in-public-api": "error",
      "local/no-turnstile-in-public-api": "error",
      "local/user-facing-mutation-needs-guard": "error",
    },
  },
  {
    // Los tests pueden ser más laxos.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
