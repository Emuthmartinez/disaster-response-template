/**
 * Integración HTTP de las rutas PÚBLICAS de personas desaparecidas
 * (/api/missing). Supertest contra el Postgres LOCAL, solo datos sintéticos.
 * Verifica contrato, paginación, el endpoint de mapa y —subiendo una foto
 * REAL— que la ficha pública exponga `photoUrl` pero nunca el base64 de la
 * columna `photo`. `contact` SÍ es público por diseño en esta ficha.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import { SYNTHETIC_PNG_DATA_URL, expectNoSensitiveFields } from "../helpers";
import { eq } from "drizzle-orm";
import request from "supertest";
import { getDb, schema } from "@/db";
import * as missingService from "@/services/missing";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

// Nombre único (>= MIN_SEARCH_LEN) → clave de cache fresca al buscarlo, sin
// chocar con el TTL del listado general. Persona sintética, sin datos reales.
function syntheticPerson() {
  const tag = `Zdemo${Math.trunc(performance.now())}`;
  return {
    name: `${tag} Persona Sintetica`,
    age: 30,
    nationality: "Venezolana",
    description: "Registro de prueba (demo)",
    lastSeen: "Plaza demo, Ciudad Ejemplo",
    contact: "demo@test.local",
    reportType: "missing" as const,
    photo: SYNTHETIC_PNG_DATA_URL,
    _tag: tag,
  };
}

describe("POST /api/missing", () => {
  it("crea CON foto y devuelve photoUrl derivada, nunca el base64 crudo", async () => {
    const person = syntheticPerson();
    const res = await request(app).post("/api/missing").send(person);
    expect(res.status).toBe(201);
    expect(res.body.person).toMatchObject({ name: person.name, status: "active" });
    const id = res.body.person.id as string;
    expect(id).toBeTruthy();
    expect(res.body.person.photoUrl).toBe(`/api/missing/${id}/photo`);
    expect(res.body.person).not.toHaveProperty("photo");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    // El walker veta `photo`/ip_hash/etc por NOMBRE de clave; el DTO público
    // expone `contact` (no una clave `email`), así que pasa sin excepciones.
    expectNoSensitiveFields(res.body);
  });

  it("rechaza un reporte sin nombre con 400 y mensaje visible", async () => {
    const res = await request(app).post("/api/missing").send({ name: "" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});

describe("GET /api/missing", () => {
  it("devuelve DTOs (con photoUrl, sin base64) y encuentra al recién creado por búsqueda", async () => {
    const person = syntheticPerson();
    const created = await request(app).post("/api/missing").send(person);
    const id = created.body.person.id as string;

    const res = await request(app).get("/api/missing").query({ q: person._tag });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.people)).toBe(true);
    expect(res.body).toMatchObject({ page: 1, persistent: true });

    const found = res.body.people.find((p: { id: string }) => p.id === id);
    expect(found).toBeTruthy();
    expect(found.photoUrl).toBe(`/api/missing/${id}/photo`);
    expect(found).not.toHaveProperty("photo");
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expectNoSensitiveFields(res.body);
  });

  it("sirve la foto subida como bytes por el endpoint dedicado (control positivo)", async () => {
    const created = await request(app).post("/api/missing").send(syntheticPerson());
    const id = created.body.person.id as string;

    const res = await request(app).get(`/api/missing/${id}/photo`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/missing/map", () => {
  it("rechaza bounds fuera de los límites terrestres", async () => {
    const res = await request(app).get("/api/missing/map").query({
      north: 91,
      south: 0,
      east: 0,
      west: 0,
    });
    expect(res.status).toBe(400);
  });

  it("devuelve marcadores ligeros sin foto cruda ni contacto", async () => {
    const res = await request(app).get("/api/missing/map");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.markers)).toBe(true);
    for (const m of res.body.markers) {
      expect(m).not.toHaveProperty("photo");
      expect(m).not.toHaveProperty("contact"); // el marcador del mapa ni siquiera lo trae
    }
    expect(JSON.stringify(res.body)).not.toContain("base64");
    expectNoSensitiveFields(res.body);
  });
});

describe("supresión permanente", () => {
  it("no reimporta una persona externa eliminada", async () => {
    const tag = `Zsuppressed${Math.trunc(performance.now())}`;
    const externalId = crypto.randomUUID();
    const source = "synthetic.test";
    const input = {
      externalId,
      source,
      name: `${tag} Persona Sintetica`,
      status: "active" as const,
    };

    await missingService.upsertExternalMissingBatch([input]);
    const before = await missingService.listMissingPage({
      status: "all",
      page: 1,
      pageSize: 10,
      search: tag,
    });
    const person = before.people[0];
    expect(person).toBeTruthy();

    expect(await missingService.removeMissing(person!.id)).toBe(true);
    await missingService.upsertExternalMissingBatch([input]);

    const after = await missingService.listMissingPage({
      status: "all",
      page: 1,
      pageSize: 10,
      search: tag,
    });
    expect(after.people).toHaveLength(0);

    const db = await getDb();
    const suppressions = await db
      .select()
      .from(schema.missingPersonSuppressions)
      .where(eq(schema.missingPersonSuppressions.legacyId, person!.id));
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0]).toMatchObject({ source, externalId });
  });
});

describe("GET /api/missing/:id/photo — cabeceras uniformes", () => {
  // Regresión: el cors() global refleja el Origin del request (Vary: Origin),
  // pero el borde de Cloudflare ignora Vary al cachear: la copia cacheada
  // llevaría el ACAO de quien pidió primero. Las fotos deben responder
  // SIEMPRE con ACAO `*`, sin credenciales y sin Vary, para ser cacheables.
  it("sirve la foto con ACAO * aunque el request no lleve Origin", async () => {
    const person = syntheticPerson();
    const created = await request(app).post("/api/missing").send(person);
    expect(created.status).toBe(201);
    const id = created.body.person.id as string;

    const res = await request(app).get(`/api/missing/${id}/photo`);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(res.headers["vary"]).toBeUndefined();
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("mantiene ACAO * también con un Origin cross-site en el request", async () => {
    const person = syntheticPerson();
    const created = await request(app).post("/api/missing").send(person);
    const id = created.body.person.id as string;

    const res = await request(app)
      .get(`/api/missing/${id}/photo`)
      .set("Origin", "https://example.org");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("GET /api/missing/:id/photo con photo_external_url", () => {
  // Regresión: fetchExternalPhoto sin try/catch convertía cualquier fallo de
  // red (host caído, DNS, timeout) en un 500 sin manejar. El contrato es el
  // mismo que el de las demás ramas sin foto: 404 limpio.
  it("responde 404 (no 500) si la fuente externa no responde", async () => {
    const { _tag, photo: _photo, ...body } = syntheticPerson();
    const created = await request(app).post("/api/missing").send(body);
    expect(created.status).toBe(201);
    const id = created.body.person.id as string;

    // photo_external_url no tiene camino de escritura público (solo el motor
    // de sync externo lo puebla); se siembra directo en la fila sintética.
    // 127.0.0.1:9 (discard): conexión rechazada al instante, sin esperar timeout.
    const db = await getDb();
    await db
      .update(schema.missingPersons)
      .set({ photoExternalUrl: "http://127.0.0.1:9/foto-inexistente.jpg" })
      .where(eq(schema.missingPersons.id, id));

    const res = await request(app).get(`/api/missing/${id}/photo`);
    expect(res.status).toBe(404);
  });
});
