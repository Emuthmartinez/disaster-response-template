/**
 * Integración HTTP de las rutas públicas de donaciones (/api/donations).
 * Supertest contra el Postgres LOCAL, solo datos sintéticos. El POST persiste
 * INTERNAMENTE el hash de IP y el user-agent; el test los provoca (mandando
 * cf-connecting-ip + User-Agent) y luego verifica que el GET de recientes NUNCA
 * los devuelve: solo expone la allowlist {id, name, amountUsd, createdAt}.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import { expectNoSensitiveFields } from "../helpers";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  app = (await import("@/server")).app;
});

describe("POST /api/donations", () => {
  // PAYPAL_DONATION_URL es opcional y NO está seteada en el entorno de test
  // (ver test/helpers.ts): el contrato por defecto es paypalUrl: null
  // ("donaciones externas deshabilitadas", ver services/donations.ts). El
  // caso con la variable configurada se cubre aparte en
  // metrics-failure.test.ts, que mockea el servicio completo — replicarlo
  // aquí exigiría reimportar @/server con otro proceso.env.PAYPAL_DONATION_URL
  // vía vi.resetModules(), lo cual no es un cambio barato en este archivo.
  it("registra la intención y devuelve { id, paypalUrl: null } sin PAYPAL_DONATION_URL configurada", async () => {
    const res = await request(app)
      .post("/api/donations")
      .set("User-Agent", "test-agent/1.0")
      .set("cf-connecting-ip", "203.0.113.50")
      .send({ name: "Donante Demo", amountCents: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.paypalUrl).toBeNull();
    expectNoSensitiveFields(res.body);
  });

  it("rechaza un monto fuera de rango con 400 y mensaje visible", async () => {
    const res = await request(app)
      .post("/api/donations")
      .send({ name: "Donante Demo", amountCents: 1 }); // por debajo del mínimo
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});

describe("GET /api/donations", () => {
  it("expone solo la allowlist en recientes, aunque ip_hash/user_agent estén en la fila", async () => {
    // Nombre único para reencontrar ESTA donación en el listado de recientes.
    const name = `Donante ${Math.trunc(performance.now())}`;
    await request(app)
      .post("/api/donations")
      .set("User-Agent", "test-agent/1.0")
      .set("cf-connecting-ip", "203.0.113.51")
      .send({ name, amountCents: 2500 });

    const res = await request(app).get("/api/donations");
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeTruthy();
    expect(Array.isArray(res.body.recent)).toBe(true);

    const mine = res.body.recent.find((d: { name: string }) => d.name === name);
    expect(mine).toBeTruthy();
    // La fila persistida TIENE ip_hash + user_agent; el DTO público no: el set
    // EXACTO de claves prueba el contrato en mi donación...
    expect(Object.keys(mine).sort()).toEqual(["amountCents", "createdAt", "id", "name"]);
    // ...y el walker cubre TODAS las filas (ip_hash/user_agent en cualquier nivel).
    expectNoSensitiveFields(res.body);
  });
});
