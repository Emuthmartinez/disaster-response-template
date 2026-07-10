/**
 * Integración HTTP del endpoint público de contacto (POST /api/contact).
 * Supertest contra el Postgres LOCAL, solo datos sintéticos. El servidor
 * persiste INTERNAMENTE el hash de IP del remitente; el test lo provoca
 * (cf-connecting-ip + User-Agent) y verifica que la respuesta sea EXACTAMENTE
 * { ok, id, message } — sin reflejar el correo, la IP ni el user-agent. (No hay
 * GET de contacto: la respuesta de escritura es la única superficie pública.)
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

function syntheticMessage() {
  return {
    name: "Remitente Demo",
    email: "remitente@test.local",
    subject: "Asunto de prueba",
    message: "Mensaje sintético para el test de integración.",
  };
}

describe("POST /api/contact", () => {
  it("acepta un mensaje válido y devuelve solo { ok, id, message }", async () => {
    const res = await request(app)
      .post("/api/contact")
      .set("User-Agent", "test-agent/1.0")
      .set("cf-connecting-ip", "203.0.113.60")
      .send(syntheticMessage());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBeTruthy();
    expect(typeof res.body.message).toBe("string");
    // Allowlist estricta de salida: el set EXACTO de claves ya prueba que ni el
    // correo enviado ni la IP/UA persistidos se reflejan (no hay dónde meterlos).
    expect(Object.keys(res.body).sort()).toEqual(["id", "message", "ok"]);
  });

  it("rechaza un correo inválido con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...syntheticMessage(), email: "no-es-correo" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("rechaza un mensaje vacío con 400", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ ...syntheticMessage(), message: "" });
    expect(res.status).toBe(400);
  });
});
