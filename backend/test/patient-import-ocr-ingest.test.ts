/**
 * Integración — ingest OCR/ICR de un lote (Minimax) en staging (#151/#158).
 *
 * INVARIANTE central: una fila extraída por OCR JAMÁS queda "valid" ni se
 * auto-aplica, aunque sus campos parezcan completos y el hospital resuelva. El
 * worker llama al proveedor, materializa las filas en staging y corre el process;
 * el process FUERZA needs_review para todo lote de origen OCR y anexa
 * OCR_REVIEW_WARNING. El apply (que solo toma "valid") no escribe nada.
 *
 * El proveedor se INYECTA (extract/config), así el suite NUNCA toca la red ni
 * depende de MINIMAX_API_KEY. Requiere el stack local (DATABASE_URL + VALKEY_URL).
 * Datos 100% sintéticos/anónimos — sin PII.
 */
import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import type { MinimaxOcrConfig } from "@/services/ocr/minimax-config";
import {
  OCR_REVIEW_WARNING,
  type OcrExtractionResult,
} from "@/services/ocr/minimax-provider";
import type { RawPatientRow } from "@/services/patient-import-logic";

const FAKE_CONFIG: MinimaxOcrConfig = {
  apiKey: "demo-token-DO-NOT-LOG",
  baseUrl: "https://api.minimax.io/v1",
  model: "MiniMax-M3",
  maxTokens: 2048,
  timeoutMs: 30_000,
  prompt: "demo prompt",
};

/** Extractor inyectado: devuelve filas sintéticas sin tocar la red. */
function fakeExtract(rows: RawPatientRow[]): () => Promise<OcrExtractionResult> {
  return async () => ({
    rows,
    model: FAKE_CONFIG.model,
    needsHumanReview: true,
    warnings: [OCR_REVIEW_WARNING],
  });
}

beforeAll(async () => {
  // Carga la app real (config/env) contra la DB local sembrada.
  await import("@/server");
});

describe("ingestOcrImport — review-required, nunca auto-aplica", () => {
  it("materializa filas OCR como needs_review (nunca valid) aunque el hospital resuelva", async () => {
    const { getDb, schema } = await import("@/db");
    const { createImport, ingestOcrImport, listImportRows, applyImport } = await import(
      "@/services/patient-imports"
    );
    const db = getDb();

    // Hospital real (resolución por nombre exacto): una fila con este hospital +
    // nombre SERÍA "valid" en el pipeline tabular. Aquí, por venir de OCR, no.
    const hospitalId = randomUUID();
    const hospitalName = `Hospital OCR Demo ${hospitalId.slice(0, 8)}`;
    await db.insert(schema.hospitals).values({
      id: hospitalId,
      name: hospitalName,
      createdAt: Date.now(),
    });

    // Lote OCR: se crea SIN filas (las extrae el "worker"). contentType image/*.
    const created = await createImport(
      { source: "test-ocr", contentType: "image/jpeg", rows: [] },
      null,
    );
    expect(created.contentType).toBe("image/jpeg");
    expect(created.counts.total).toBe(0);

    // Fila "completa": nombre + hospital resoluble. En tabular daría valid=1.
    const extractedName = `Paciente OCR ${hospitalId.slice(0, 8)}`;
    const summary = await ingestOcrImport(created.id, "https://example.test/scan.jpg", {
      config: FAKE_CONFIG,
      extract: fakeExtract([{ name: extractedName, hospital: hospitalName, age: 42 }]),
    });

    // INVARIANTE: nunca valid; siempre review.
    expect(summary.status).toBe("processed");
    expect(summary.counts.total).toBe(1);
    expect(summary.counts.valid).toBe(0);
    expect(summary.counts.review).toBe(1);

    const rows = await listImportRows(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rowStatus).toBe("needs_review");
    expect(rows[0]!.validationWarnings).toContain(OCR_REVIEW_WARNING);

    // El apply no escribe NADA: no hay filas "valid".
    const applied = await applyImport(created.id, null);
    expect(applied.counts.applied).toBe(0);

    // Confirmación directa en DB: ninguna fila quedó "valid" ni con patient_id.
    const { and, eq } = await import("drizzle-orm");
    const stillValid = await db
      .select({ id: schema.patientImportRows.id })
      .from(schema.patientImportRows)
      .where(
        and(
          eq(schema.patientImportRows.importId, created.id),
          eq(schema.patientImportRows.rowStatus, "valid"),
        ),
      );
    expect(stillValid).toHaveLength(0);
  });

  it("reintento del job re-extrae sin duplicar filas (replace idempotente)", async () => {
    const { createImport, ingestOcrImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const created = await createImport(
      { source: "test-ocr-retry", contentType: "image/png", rows: [] },
      null,
    );
    const deps = {
      config: FAKE_CONFIG,
      extract: fakeExtract([{ name: "Demo Anon Uno" }, { name: "Demo Anon Dos" }]),
    };
    await ingestOcrImport(created.id, "https://example.test/scan.png", deps);
    const second = await ingestOcrImport(created.id, "https://example.test/scan.png", deps);

    expect(second.counts.total).toBe(2);
    const rows = await listImportRows(created.id);
    expect(rows).toHaveLength(2); // no se duplicó al re-correr
  });

  it("reintento desde un lote atascado en 'processing' lo re-reclama y procesa", async () => {
    const { getDb, schema } = await import("@/db");
    const { createImport, ingestOcrImport, listImportRows } = await import(
      "@/services/patient-imports"
    );
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const created = await createImport(
      { source: "test-ocr-stuck", contentType: "image/jpeg", rows: [] },
      null,
    );
    const deps = {
      config: FAKE_CONFIG,
      extract: fakeExtract([{ name: "Demo Anon Tres" }, { name: "Demo Anon Cuatro" }]),
    };

    // Primer ingest/process: deja el lote en processed con 2 filas needs_review.
    const first = await ingestOcrImport(created.id, "https://example.test/scan.jpg", deps);
    expect(first.status).toBe("processed");
    expect(first.counts.total).toBe(2);

    // Simula un job muerto a mitad: processImport selló 'processing' y nunca
    // terminó, dejando la cabecera atascada. Es el estado del que un retry debe
    // poder re-arrancar (antes del fix, replaceStagingRows no lo reabría).
    await db
      .update(schema.patientImports)
      .set({ status: "processing", updatedAt: Date.now() })
      .where(eq(schema.patientImports.id, created.id));

    // Reintento del job (BullMQ): re-extrae y re-procesa. Sin el fix,
    // processImport no podía reclamar 'processing' y devolvía el lote atascado,
    // dejando al worker reportando éxito sobre un import que nunca avanzó.
    const retried = await ingestOcrImport(created.id, "https://example.test/scan.jpg", deps);

    expect(retried.status).toBe("processed");
    expect(retried.counts.total).toBe(2);
    expect(retried.counts.valid).toBe(0);
    expect(retried.counts.review).toBe(2);

    // No se duplicaron filas y la invariante OCR se mantiene (todo needs_review).
    const rows = await listImportRows(created.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.rowStatus === "needs_review")).toBe(true);
  });

  it("config ausente o imageUrl ausente lanza (worker lo sella failed en el último intento)", async () => {
    const { createImport, ingestOcrImport } = await import("@/services/patient-imports");
    const created = await createImport(
      { source: "test-ocr-guard", contentType: "image/jpeg", rows: [] },
      null,
    );
    await expect(
      ingestOcrImport(created.id, "https://example.test/scan.jpg", { config: null }),
    ).rejects.toThrow();
    await expect(
      ingestOcrImport(created.id, undefined, { config: FAKE_CONFIG }),
    ).rejects.toThrow();
  });
});
