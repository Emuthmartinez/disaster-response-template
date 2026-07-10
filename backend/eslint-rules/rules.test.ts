/**
 * Tests de las reglas ESLint locales (RuleTester). Estándar: una regla custom se
 * prueba como cualquier código — casos válidos e inválidos. Garantiza que el gate
 * de arquitectura hace exactamente lo que dice (y no flaggea de más).
 */
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import plugin from "./index.js";

// RuleTester con parser por defecto (espree) — las reglas solo miran estructura
// JS (CallExpression/MemberExpression), no tipos, así que no hace falta TS parser.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

// Los filenames simulan la ubicación (las reglas dependen del path).
const PUBLIC_API = "/repo/backend/src/public-api/resources/x.resource.ts";
const ROUTES = "/repo/backend/src/routes/x.ts";
const MODULES = "/repo/backend/src/modules/acopio/interface/http/x-router.ts";

describe("require-rate-limit", () => {
  it("pasa/falla según rateLimit", () => {
    ruleTester.run("require-rate-limit", plugin.rules["require-rate-limit"], {
      valid: [
        { code: `router.get("/", rateLimit({scope:"x",limit:1}), handler)`, filename: ROUTES },
        // No es una ruta (no router) -> ignorado.
        { code: `arr.map(x => x)`, filename: ROUTES },
      ],
      invalid: [
        {
          code: `router.get("/", validate({}), handler)`,
          filename: ROUTES,
          errors: [{ messageId: "missing" }],
        },
      ],
    });
  });
});

describe("require-capability-in-public-api", () => {
  it("exige requireCapability en public-api", () => {
    ruleTester.run("require-capability-in-public-api", plugin.rules["require-capability-in-public-api"], {
      valid: [
        {
          code: `router.post("/", rateLimit({}), requireCapability("x:create"), handler)`,
          filename: PUBLIC_API,
        },
        // Fuera de public-api -> la regla no aplica.
        { code: `router.post("/", handler)`, filename: ROUTES },
      ],
      invalid: [
        {
          code: `router.get("/", rateLimit({}), handler)`,
          filename: PUBLIC_API,
          errors: [{ messageId: "missing" }],
        },
      ],
    });
  });
});

describe("no-turnstile-in-public-api", () => {
  it("prohíbe requireHuman en public-api", () => {
    ruleTester.run("no-turnstile-in-public-api", plugin.rules["no-turnstile-in-public-api"], {
      valid: [{ code: `router.post("/", requireCapability("x"), handler)`, filename: PUBLIC_API }],
      invalid: [
        {
          code: `router.post("/", requireHuman, handler)`,
          filename: PUBLIC_API,
          errors: [{ messageId: "forbidden" }],
        },
      ],
    });
  });
});

describe("user-facing-mutation-needs-guard", () => {
  it("mutación sin gate ni turnstile falla; con cualquiera pasa", () => {
    ruleTester.run("user-facing-mutation-needs-guard", plugin.rules["user-facing-mutation-needs-guard"], {
      valid: [
        { code: `router.post("/", requireHuman, handler)`, filename: ROUTES },
        { code: `router.delete("/:id", requireAdmin, handler)`, filename: ROUTES },
        // GET no es mutación -> ok sin gate.
        { code: `router.get("/", handler)`, filename: ROUTES },
        // Módulos de integración (DDD): la regla también los cubre.
        { code: `router.post("/", requireCapability("x"), handler)`, filename: MODULES },
      ],
      invalid: [
        {
          code: `router.post("/", validate({}), handler)`,
          filename: ROUTES,
          errors: [{ messageId: "unguarded" }],
        },
        {
          // Mutación sin guard dentro de un módulo -> también falla.
          code: `router.post("/", validate({}), handler)`,
          filename: MODULES,
          errors: [{ messageId: "unguarded" }],
        },
      ],
    });
  });
});
