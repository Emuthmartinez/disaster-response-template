/**
 * C6 (#151) — Resolución BATCH de hospitales en `processImport`.
 *
 * `processImport` resolvía el hospital fila por fila (N+1 en lotes grandes). Este
 * test recorre el flujo REAL con DB (createImport → processImport → listImportRows)
 * y demuestra que la resolución batch preserva el comportamiento por fila:
 *   - id explícito existente resuelve;
 *   - nombre exacto case-insensitive resuelve;
 *   - nombre ambiguo (≥2 hospitales con el mismo nombre) queda needs_review;
 *   - nombre con texto pero sin match queda needs_review;
 *   - todo mezclado en UN lote produce los mismos veredictos por fila.
 *
 * Requiere el stack local arriba (docker compose up): DATABASE_URL + VALKEY_URL.
 * PII sintética: hospitales/nombres demo, nunca datos reales.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { randomUUID } from "crypto";

beforeAll(async () => {
  await import("@/server");
});

async function makeHospital(name: string): Promise<{ id: string; name: string }> {
  const { getDb, schema } = await import("@/db");
  const db = getDb();
  const id = randomUUID();
  await db.insert(schema.hospitals).values({ id, name, createdAt: Date.now() });
  return { id, name };
}

describe("resolución batch de hospitales en processImport (C6, #151)", () => {
  it("resuelve nombres exactos (case-insensitive) en batch y los marca válidos", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const suffix = randomUUID().slice(0, 8);
    const a = await makeHospital(`Hospital Batch A ${suffix}`);
    const b = await makeHospital(`Hospital Batch B ${suffix}`);

    const created = await createImport(
      {
        source: "test",
        rows: [
          // Nombre exacto con distinta capitalización → debe resolver a `a`.
          { name: "Ana Demo", hospital: a.name.toUpperCase(), age: 20 },
          { name: "Bruno Demo", hospital: b.name, age: 30 },
        ],
      },
      null,
    );
    const processed = await processImport(created.id);
    expect(processed.counts.valid).toBe(2);
    expect(processed.counts.review).toBe(0);
    expect(processed.counts.invalid).toBe(0);

    const rows = await listImportRows(created.id);
    expect(rows[0]?.hospitalId).toBe(a.id);
    expect(rows[1]?.hospitalId).toBe(b.id);
  });

  it("resuelve por id explícito en batch (gana sobre el nombre)", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const suffix = randomUUID().slice(0, 8);
    const h = await makeHospital(`Hospital Batch Id ${suffix}`);

    const created = await createImport(
      {
        source: "test",
        // Texto de hospital inexistente, pero id explícito válido → resuelve por id.
        rows: [{ name: "Carla Demo", hospital: "texto que no existe", hospitalId: h.id, age: 40 }],
      },
      null,
    );
    const processed = await processImport(created.id);
    expect(processed.counts.valid).toBe(1);

    const rows = await listImportRows(created.id);
    expect(rows[0]?.hospitalId).toBe(h.id);
  });

  it("preserva la regla de ambigüedad: nombre que matchea ≥2 hospitales queda needs_review", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const suffix = randomUUID().slice(0, 8);
    const dupName = `Hospital Ambiguo ${suffix}`;
    // Dos hospitales con el MISMO nombre → ambiguo, no se resuelve.
    await makeHospital(dupName);
    await makeHospital(dupName);

    const created = await createImport(
      { source: "test", rows: [{ name: "Diana Demo", hospital: dupName, age: 50 }] },
      null,
    );
    const processed = await processImport(created.id);
    expect(processed.counts.review).toBe(1);
    expect(processed.counts.valid).toBe(0);

    const rows = await listImportRows(created.id);
    expect(rows[0]?.rowStatus).toBe("needs_review");
    expect(rows[0]?.hospitalId).toBeNull();
  });

  it("nombre con texto pero sin match queda needs_review (B2), ausencia total queda invalid", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const created = await createImport(
      {
        source: "test",
        rows: [
          // Texto de hospital sin match en DB → needs_review (hay pista, falta resolver).
          { name: "Elena Demo", hospital: `Inexistente ${randomUUID().slice(0, 8)}`, age: 60 },
          // Sin hospital ni id → invalid (no hay nada que resolver).
          { name: "Fabio Demo", age: 70 },
        ],
      },
      null,
    );
    const processed = await processImport(created.id);
    expect(processed.counts.review).toBe(1);
    expect(processed.counts.invalid).toBe(1);

    const rows = await listImportRows(created.id);
    expect(rows[0]?.rowStatus).toBe("needs_review");
    expect(rows[0]?.hospitalId).toBeNull();
    expect(rows[1]?.rowStatus).toBe("invalid");
  });

  it("lote MIXTO grande: cada fila conserva su veredicto con una resolución batch", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const suffix = randomUUID().slice(0, 8);
    const known = await makeHospital(`Hospital Mixto ${suffix}`);
    const ambiguous = `Hospital Mixto Ambiguo ${suffix}`;
    await makeHospital(ambiguous);
    await makeHospital(ambiguous);

    // 6 filas: 2 por nombre exacto, 1 por id, 1 ambigua, 1 sin match, 1 sin hospital.
    const created = await createImport(
      {
        source: "test",
        rows: [
          { name: "G Uno", hospital: known.name, age: 21 },
          { name: "G Dos", hospital: known.name.toLowerCase(), age: 22 },
          { name: "G Tres", hospital: "no importa", hospitalId: known.id, age: 23 },
          { name: "G Cuatro", hospital: ambiguous, age: 24 },
          { name: "G Cinco", hospital: `Otro Inexistente ${suffix}`, age: 25 },
          { name: "G Seis", age: 26 },
        ],
      },
      null,
    );
    const processed = await processImport(created.id);
    // 3 válidas (2 nombre exacto + 1 id), 2 needs_review (ambigua + sin match),
    // 1 invalid (sin hospital). Todo con una sola resolución batch.
    expect(processed.counts.valid).toBe(3);
    expect(processed.counts.review).toBe(2);
    expect(processed.counts.invalid).toBe(1);

    const rows = await listImportRows(created.id);
    expect(rows.map((r) => r.rowStatus)).toEqual([
      "valid",
      "valid",
      "valid",
      "needs_review",
      "needs_review",
      "invalid",
    ]);
    expect(rows[0]?.hospitalId).toBe(known.id);
    expect(rows[2]?.hospitalId).toBe(known.id);
  });
});
