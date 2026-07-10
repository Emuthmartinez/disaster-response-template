/**
 * ESLint flat config del panel admin (app Next.js plana, sin monorepo).
 *
 * Compone:
 *  1. @eslint/js recommended
 *  2. eslint-config-next (incluye typescript-eslint, react, react-hooks,
 *     jsx-a11y, @next/eslint-plugin-next)
 *  3. Reglas de frontera DDD (domain/application no dependen de
 *     infrastructure/ui; ui no depende de contexts)
 *  4. Bloque vitest scoped a tests
 *  5. kebab-case de archivos .ts/.tsx (con excepciones de archivos especiales
 *     de Next)
 *
 * NO se hace spread de typescript-eslint/jsx-a11y por separado: eslint-config-next
 * ya los registra y duplicarlos provoca "Cannot redefine plugin".
 */

import js from "@eslint/js";
import nextConfig from "eslint-config-next";
import unicorn from "eslint-plugin-unicorn";
import vitest from "eslint-plugin-vitest";

// domain + application: no deben importar de infrastructure ni ui.
const domainApplicationBoundary = {
  name: "admin/boundaries/domain-application",
  files: ["**/domain/**", "**/application/**"],
  ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/infrastructure/**", "**/ui/**"],
            message:
              "domain/application no deben depender de infrastructure ni ui (capas DDD)",
          },
        ],
      },
    ],
  },
};

// ui: no debe importar de contexts (componentes agnósticos de dominio).
const uiBoundary = {
  name: "admin/boundaries/ui",
  files: ["**/ui/**"],
  ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/contexts/**"],
            message:
              "ui debe permanecer agnóstico de dominio (sin imports de contexts)",
          },
        ],
      },
    ],
  },
};

// Vitest: reglas + globals, solo en archivos de test.
const vitestConfig = {
  name: "admin/vitest",
  files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
  plugins: vitest.configs.recommended.plugins,
  rules: vitest.configs.recommended.rules,
  languageOptions: vitest.configs.env.languageOptions,
};

// @typescript-eslint/no-unused-vars (vía eslint-config-next) es la única
// autoridad sobre variables sin usar en TS; apagamos la regla core.
const tsNoUnusedVarsOverride = {
  name: "admin/ts-no-unused-vars-override",
  files: ["**/*.{ts,tsx}"],
  rules: {
    "no-unused-vars": "off",
  },
};

// kebab-case en archivos .ts/.tsx, salvo los especiales de Next.
const filenameCaseConfig = {
  name: "admin/filename-case",
  files: ["**/*.{ts,tsx}"],
  ignores: [
    "**/page.tsx",
    "**/layout.tsx",
    "**/route.ts",
    "**/route.tsx",
    "**/middleware.ts",
    "**/loading.tsx",
    "**/error.tsx",
    "**/not-found.tsx",
    "**/template.tsx",
    "**/default.tsx",
  ],
  plugins: { unicorn },
  rules: {
    "unicorn/filename-case": ["error", { case: "kebabCase" }],
  },
};

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**"],
  },
  js.configs.recommended,
  ...nextConfig,
  domainApplicationBoundary,
  uiBoundary,
  vitestConfig,
  tsNoUnusedVarsOverride,
  filenameCaseConfig,
];

export default config;
