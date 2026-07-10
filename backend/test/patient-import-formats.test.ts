/**
 * Integración (#151, Fase 4) — creación de lotes en JSON, CSV y XLSX.
 *
 * Dos niveles, a propósito:
 *   - ROUTE (`POST /api/public/patient-imports`): valida el CONTRATO de entrada —
 *     202, contentType registrado y que el archivo CSV/XLSX se MATERIALIZA a la
 *     misma forma de staging que el JSON (counts.total). No dispara el procesado
 *     aquí: el route encola y el worker procesa async; correr `processImport`
 *     contra un id ya encolado competiría con cualquier worker vivo (flaky).
 *   - SERVICE directo: `createImport` (no encola) → `processImport` prueba, sin
 *     carrera, que las filas PARSEADAS de CSV/XLSX normalizan/validan igual que el
 *     JSON (mismo patrón que patient-import-hospital-batch).
 *
 * Requiere el stack local arriba (docker compose up): DATABASE_URL + VALKEY_URL.
 * PII 100% sintética: hospitales/nombres demo, nunca datos reales.
 */
import { randomUUID } from "crypto";

import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import request from "supertest";

import { ensureSeed, makeUserWithCaps } from "./helpers";
import { buildXlsxCorruptDeflate, buildXlsxShared } from "./xlsx-fixture";
import { CONTENT_TYPE, parseImportFile } from "@/services/patient-import-parse";

const XLSX_MIME = CONTENT_TYPE.XLSX;

let app: import("express").Express;
let token: string;

beforeAll(async () => {
  await ensureSeed();
  app = (await import("@/server")).app;
  token = (await makeUserWithCaps(["patient:import"])).token;
});

async function makeHospital(name: string): Promise<string> {
  const { getDb, schema } = await import("@/db");
  const db = getDb();
  const id = randomUUID();
  await db.insert(schema.hospitals).values({ id, name, createdAt: Date.now() });
  return id;
}

function post(body: Record<string, unknown>) {
  return request(app)
    .post("/api/public/patient-imports")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe("createImport por formato — contrato del route (Fase 4)", () => {
  it("JSON sigue funcionando (no regresión): 202 y staging", async () => {
    const res = await post({ source: "test", rows: [{ name: "Demo Json", hospital: "Hospital Demo" }] });
    expect(res.status).toBe(202);
    expect(res.body.import.contentType).toBe("application/json");
    expect(res.body.import.counts.total).toBe(1);
  });

  it("CSV en fileBase64: 202 y NO se materializa en el route (parseo en worker)", async () => {
    const csv = "name,hospital,age\nDemo Csv,Hospital Demo,45\nOtro Csv,Hospital Demo,30";
    const res = await post({
      contentType: "text/csv",
      fileBase64: Buffer.from(csv, "utf8").toString("base64"),
    });
    expect(res.status).toBe(202);
    expect(res.body.import.contentType).toBe("text/csv");
    // El route ya NO parsea el archivo: crea la cabecera SIN filas y encola el
    // worker, que materializa las filas. counts.total es 0 hasta que el worker
    // procesa (ver la suite de `ingestFileImport` más abajo).
    expect(res.body.import.counts.total).toBe(0);
    expect(res.body.import.status).toBe("queued");
    // El fileBase64 nunca se refleja en la respuesta (no se expone ni se persiste).
    expect(res.body.import.fileBase64).toBeUndefined();
  });

  it("XLSX en fileBase64: 202 y NO se materializa en el route (parseo en worker)", async () => {
    const xlsx = buildXlsxShared([
      ["name", "hospital", "age"],
      ["Demo Xlsx", "Hospital Demo", "30"],
    ]);
    const res = await post({ contentType: XLSX_MIME, fileBase64: xlsx.toString("base64") });
    expect(res.status).toBe(202);
    expect(res.body.import.contentType).toBe(XLSX_MIME);
    expect(res.body.import.counts.total).toBe(0);
    expect(res.body.import.status).toBe("queued");
  });

  it("archivo ilegible: el route acepta (202); el fallo lo detecta el worker", async () => {
    // El route valida solo la FORMA (base64 con longitud acotada). Un archivo que
    // no es un XLSX real ya NO se rechaza con 400 aquí: el parseo ocurre en el
    // worker (ingestFileImport), que sella el lote como `failed`. El contrato del
    // route es el 202; el fallo por-lote se prueba a nivel de service más abajo.
    const res = await post({
      contentType: XLSX_MIME,
      fileBase64: Buffer.from("no soy xlsx").toString("base64"),
    });
    expect(res.status).toBe(202);
    expect(res.body.import.counts.total).toBe(0);
  });
});

describe("ingestFileImport (worker) — parsea el archivo, materializa y procesa", () => {
  it("CSV: materializa las filas y las procesa (mismo pipeline que JSON)", async () => {
    const { createImport, ingestFileImport } = await import("@/services/patient-imports");
    const hospital = `Hospital CSVW ${randomUUID().slice(0, 8)}`;
    await makeHospital(hospital);
    const csv = `name,hospital,age\nDemo Csv,${hospital},45\nOtro Csv,${hospital},30`;
    const fileBase64 = Buffer.from(csv, "utf8").toString("base64");
    // El route crea el lote SIN filas; el worker llama a ingestFileImport con el
    // archivo del payload del job.
    const created = await createImport(
      { source: "test", contentType: "text/csv", rows: [] },
      null,
    );
    expect(created.counts.total).toBe(0);
    const processed = await ingestFileImport(created.id, "text/csv", fileBase64);
    expect(processed.status).toBe("processed");
    expect(processed.counts.total).toBe(2);
    expect(processed.counts.valid).toBe(2);
  });

  it("XLSX: materializa las filas y las procesa", async () => {
    const { createImport, ingestFileImport } = await import("@/services/patient-imports");
    const hospital = `Hospital XLSXW ${randomUUID().slice(0, 8)}`;
    await makeHospital(hospital);
    const xlsx = buildXlsxShared([
      ["name", "hospital", "age"],
      ["Demo Xlsx", hospital, "30"],
    ]);
    const created = await createImport(
      { source: "test", contentType: XLSX_MIME, rows: [] },
      null,
    );
    const processed = await ingestFileImport(created.id, XLSX_MIME, xlsx.toString("base64"));
    expect(processed.counts.total).toBe(1);
    expect(processed.counts.valid).toBe(1);
  });

  it("archivo ilegible: ingestFileImport lanza (el worker lo sella failed)", async () => {
    const { createImport, ingestFileImport } = await import("@/services/patient-imports");
    const created = await createImport(
      { source: "test", contentType: XLSX_MIME, rows: [] },
      null,
    );
    await expect(
      ingestFileImport(created.id, XLSX_MIME, Buffer.from("no soy xlsx").toString("base64")),
    ).rejects.toThrow();
  });

  it("XLSX con deflate corrupto: ingestFileImport lanza (no rompe silencioso)", async () => {
    const { createImport, ingestFileImport } = await import("@/services/patient-imports");
    const created = await createImport(
      { source: "test", contentType: XLSX_MIME, rows: [] },
      null,
    );
    await expect(
      ingestFileImport(created.id, XLSX_MIME, buildXlsxCorruptDeflate().toString("base64")),
    ).rejects.toThrow();
  });
});

describe("filas parseadas de CSV/XLSX normalizan/validan igual que JSON", () => {
  it("CSV: las filas parseadas resuelven hospital y quedan válidas", async () => {
    const { createImport, processImport } = await import("@/services/patient-imports");
    const hospital = `Hospital CSV ${randomUUID().slice(0, 8)}`;
    await makeHospital(hospital);
    const csv = `name,hospital,age\nDemo Csv,${hospital},45`;
    const rows = parseImportFile(CONTENT_TYPE.CSV, Buffer.from(csv, "utf8").toString("base64"));
    const created = await createImport({ source: "test", contentType: "text/csv", rows }, null);
    const processed = await processImport(created.id);
    expect(processed.counts.total).toBe(1);
    expect(processed.counts.valid).toBe(1);
  });

  it("XLSX: las filas parseadas resuelven hospital y quedan válidas", async () => {
    const { createImport, processImport } = await import("@/services/patient-imports");
    const hospital = `Hospital Xlsx ${randomUUID().slice(0, 8)}`;
    await makeHospital(hospital);
    const xlsx = buildXlsxShared([
      ["name", "hospital", "age"],
      ["Demo Xlsx", hospital, "30"],
    ]);
    const rows = parseImportFile(CONTENT_TYPE.XLSX, xlsx.toString("base64"));
    const created = await createImport({ source: "test", contentType: XLSX_MIME, rows }, null);
    const processed = await processImport(created.id);
    expect(processed.counts.total).toBe(1);
    expect(processed.counts.valid).toBe(1);
  });
});
