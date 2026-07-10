/**
 * Integración de dedup por DOCUMENTO (#151) — cierra el hueco donde el bloqueo
 * por `nameKey` impedía que `classifyDedup` viera candidatos con el MISMO
 * document_hash pero distinto nombre.
 *
 * A diferencia de patient-import-logic.test.ts (que llama a `classifyDedup`
 * directo y da falsa confianza), esto recorre el flujo REAL con DB:
 * createImport → processImport, y demuestra que un mismo documento con nombre
 * distinto se detecta como duplicado fuerte tanto contra la DB como intra-lote.
 *
 * Requiere el stack local arriba (docker compose up): DATABASE_URL + VALKEY_URL.
 * PII sintética: cédulas/nombres demo, nunca datos reales.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import { randomUUID } from "crypto";

beforeAll(async () => {
  // Asegura que la app/env esté cargada (mismo patrón que el resto de la suite).
  await import("@/server");
});

async function freshHospital(): Promise<{ id: string; name: string }> {
  const { getDb, schema } = await import("@/db");
  const db = getDb();
  const id = randomUUID();
  const name = `Hospital Dedup ${id.slice(0, 8)}`;
  await db.insert(schema.hospitals).values({ id, name, createdAt: Date.now() });
  return { id, name };
}

describe("dedup por document_hash con nombre distinto (#151)", () => {
  it("detecta duplicado contra un paciente EXISTENTE en DB con otro nombre", async () => {
    const { createImport, processImport, applyImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const hospital = await freshHospital();
    // Documento demo compartido; los dígitos producen el mismo HMAC.
    const documentId = "V-12.345.678";

    // 1) Primer lote: crea el paciente base (nombre A) y lo aplica a hospital_patients.
    const first = await createImport(
      {
        source: "test",
        rows: [{ name: "Alicia Demo", hospital: hospital.name, age: 41, documentId }],
      },
      null,
    );
    const processedFirst = await processImport(first.id);
    expect(processedFirst.counts.valid).toBe(1);
    const appliedFirst = await applyImport(first.id, null);
    expect(appliedFirst.counts.applied).toBe(1);

    // 2) Segundo lote: MISMO documento, nombre DISTINTO → debe ser duplicado.
    const second = await createImport(
      {
        source: "test",
        rows: [{ name: "Beatriz Otra", hospital: hospital.name, age: 73, documentId }],
      },
      null,
    );
    const processedSecond = await processImport(second.id);
    expect(processedSecond.counts.duplicate).toBe(1);
    expect(processedSecond.counts.valid).toBe(0);

    const rows = await listImportRows(second.id);
    expect(rows[0]?.dedupStatus).toBe("duplicate");
    expect(rows[0]?.confidence).toBe(1);
    expect(rows[0]?.dedupCandidates[0]?.reason).toBe("document_hash exacto");
  });

  it("detecta duplicado INTRA-lote: mismo documento, nombre distinto en el mismo lote", async () => {
    const { createImport, processImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const hospital = await freshHospital();
    const documentId = "V-99.888.777";

    const created = await createImport(
      {
        source: "test",
        rows: [
          { name: "Carlos Uno", hospital: hospital.name, age: 30, documentId },
          { name: "Daniela Dos", hospital: hospital.name, age: 55, documentId },
        ],
      },
      null,
    );
    const processed = await processImport(created.id);
    // La primera fila gana (única), la segunda se marca duplicada por documento.
    expect(processed.counts.valid).toBe(1);
    expect(processed.counts.duplicate).toBe(1);

    const rows = await listImportRows(created.id);
    expect(rows[0]?.dedupStatus).toBe("unique");
    expect(rows[1]?.dedupStatus).toBe("duplicate");
    expect(rows[1]?.confidence).toBe(1);
  });
});
