/**
 * Integridad del catálogo de capacidades — comprobaciones CROSS-FILE que ESLint
 * (per-file) no puede hacer bien. Cargan los módulos reales y verifican que el
 * motor de auth es coherente:
 *
 *   1. Toda capacidad usada en requireCapability("x") y en los recursos existe
 *      en el catálogo (un typo => 403 para siempre; lo atrapamos aquí).
 *   2. Cada recurso de PUBLIC_RESOURCES tiene su CRUD completo en el catálogo.
 *   3. El catálogo no tiene keys duplicadas.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import "./helpers";

describe("integridad del catálogo de capacidades", () => {
  it("toda requireCapability(\"x\") referencia una capacidad del catálogo", async () => {
    const { CAPABILITY_KEYS } = await import("@/auth/capabilities");
    // Escanea el código fuente por usos literales de requireCapability("...").
    const srcDir = join(import.meta.dirname, "..", "src");
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) {
          const src = readFileSync(p, "utf8");
          // Solo literales estáticos: "x:read" / 'x:read'. Las plantillas
          // (`${cap}:${verb}` en el factory) son dinámicas — las cubre la otra
          // prueba (cada recurso tiene su CRUD en el catálogo).
          for (const m of src.matchAll(/requireCapability\(\s*["']([^"']+)["']/g)) {
            used.add(m[1]);
          }
        }
      }
    };
    walk(srcDir);
    const unknown = [...used].filter((k) => !CAPABILITY_KEYS.has(k));
    expect(unknown, `capacidades usadas pero no en el catálogo: ${unknown.join(", ")}`).toEqual([]);
  });

  it("cada recurso de api/public tiene su CRUD (read/create/edit/delete) en el catálogo", async () => {
    const { CAPABILITY_KEYS } = await import("@/auth/capabilities");
    const { PUBLIC_RESOURCES } = await import("@/public-api");
    const missing: string[] = [];
    for (const resource of Object.values(PUBLIC_RESOURCES)) {
      const cap = (resource as { capability: string }).capability;
      for (const verb of ["read", "create", "edit", "delete"]) {
        if (!CAPABILITY_KEYS.has(`${cap}:${verb}`)) missing.push(`${cap}:${verb}`);
      }
    }
    expect(missing, `capacidades CRUD faltantes en el catálogo: ${missing.join(", ")}`).toEqual([]);
  });

  it("el catálogo no tiene keys duplicadas", async () => {
    const { CAPABILITIES, CAPABILITY_KEYS } = await import("@/auth/capabilities");
    expect(CAPABILITIES.length).toBe(CAPABILITY_KEYS.size);
  });
});
