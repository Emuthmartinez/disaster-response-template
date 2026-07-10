/**
 * Integración HTTP de las rutas PÚBLICAS de reportes (/api/reports). Levanta la
 * app real con supertest (sin abrir puerto) contra el Postgres LOCAL. Solo datos
 * sintéticos. Verifica contrato, status codes, errores visibles, límites de
 * tamaño y —subiendo una foto REAL— que la respuesta no filtre la columna
 * `photo` cruda (base64): solo se expone la URL derivada `photoUrl`.
 *
 * Requiere el stack local (docker compose up) o los service containers del CI.
 * El rate-limit va deshabilitado aquí (helpers fija RATE_LIMIT_DISABLED=1); su
 * comportamiento se prueba aparte en test/api/rate-limit.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import { SYNTHETIC_PNG_DATA_URL, expectNoSensitiveFields } from "../helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

// Marcador sintético sobre coordenadas demo (Ciudad Ejemplo), sin datos reales.
function syntheticReport(overrides: Record<string, unknown> = {}) {
  return {
    type: "critical",
    lat: 10.5,
    lng: -66.9,
    place: `Punto demo ${Math.trunc(performance.now())}`,
    affected: 3,
    needs: "Agua y alimentos (demo)",
    ...overrides,
  };
}

describe("POST /api/reports", () => {
  it("crea un reporte CON foto y devuelve photoUrl derivada, nunca el base64 crudo", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send(syntheticReport({ photo: SYNTHETIC_PNG_DATA_URL }));
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({ type: "critical", confirmations: 0 });
    const id = res.body.report.id as string;
    expect(id).toBeTruthy();
    // La foto SÍ se subió → photoUrl apunta al endpoint, pero el base64 no se
    // serializa: ni la clave `photo` ni el payload aparecen en la respuesta.
    expect(res.body.report.photoUrl).toBe(`/api/reports/${id}/photo`);
    expect(res.body.report).not.toHaveProperty("photo");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expectNoSensitiveFields(res.body);
  });

  it("rechaza entrada inválida con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send({ type: "no-existe", lat: 10, lng: -66, place: "x" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("rechaza coordenadas fuera de los límites terrestres", async () => {
    const res = await request(app)
      .post("/api/reports")
      .send(syntheticReport({ lat: 91, lng: -181 }));
    expect(res.status).toBe(400);
  });

  it("rechaza una foto sobredimensionada (límite de tamaño)", async () => {
    const huge = "x".repeat(1_400_001); // > MAX_REPORT_PHOTO_CHARS
    const res = await request(app)
      .post("/api/reports")
      .send(syntheticReport({ photo: huge }));
    expect([400, 413]).toContain(res.status);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("GET /api/reports", () => {
  it("pagina sin truncar el acceso después de 500 reportes", async () => {
    const { getDb, schema } = await import("@/db");
    const { invalidate } = await import("@/lib/cache");
    const prefix = `page-${crypto.randomUUID()}`;
    await getDb().insert(schema.reports).values(
      Array.from({ length: 501 }, (_, index) => ({
        id: `${prefix}-${index}`,
        type: "critical",
        lat: 10.5,
        lng: -66.9,
        place: `Punto paginado ${index}`,
        affected: 0,
        needs: "",
        createdAt: Date.now() + index,
      })),
    );
    invalidate();

    const res = await request(app).get("/api/reports").query({ page: 2, pageSize: 500 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(500);
    expect(res.body.page).toBe(2);
    expect(res.body.reports.some((report: { id: string }) => report.id.startsWith(prefix))).toBe(true);
  });

  it("lista DTOs con photoUrl pero sin la foto embebida en base64", async () => {
    const created = await request(app)
      .post("/api/reports")
      .send(syntheticReport({ photo: SYNTHETIC_PNG_DATA_URL }));
    const id = created.body.report.id as string;

    const res = await request(app).get("/api/reports");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
    const mine = res.body.reports.find((r: { id: string }) => r.id === id);
    expect(mine).toBeTruthy();
    expect(mine.photoUrl).toBe(`/api/reports/${id}/photo`);
    for (const r of res.body.reports) expect(r).not.toHaveProperty("photo");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expectNoSensitiveFields(res.body);
  });

  it("sirve la foto subida como bytes por el endpoint dedicado (control positivo)", async () => {
    const created = await request(app)
      .post("/api/reports")
      .send(syntheticReport({ photo: SYNTHETIC_PNG_DATA_URL }));
    const id = created.body.report.id as string;

    const res = await request(app).get(`/api/reports/${id}/photo`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body.length).toBeGreaterThan(0); // bytes reales, no base64
  });
});

describe("POST /api/reports/:id/confirm", () => {
  it("devuelve 404 antes de confirmar un reporte inexistente", async () => {
    const res = await request(app).post(`/api/reports/${crypto.randomUUID()}/confirm`);
    expect(res.status).toBe(404);
  });

  it("confirma una vez (200) y deduplica la segunda desde la misma IP (409)", async () => {
    const created = await request(app).post("/api/reports").send(syntheticReport());
    const id = created.body.report.id as string;

    const first = await request(app).post(`/api/reports/${id}/confirm`);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, confirmations: 1 });

    const second = await request(app).post(`/api/reports/${id}/confirm`);
    expect(second.status).toBe(409);
    expect(second.body.ok).toBe(false);
  });
});
