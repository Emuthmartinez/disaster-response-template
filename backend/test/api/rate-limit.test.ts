/**
 * Integración del RATE-LIMIT de una ruta pública. Es el ÚNICO archivo que
 * reactiva el limitador: el resto del suite corre con RATE_LIMIT_DISABLED=1
 * (helpers) para no volverse flaky golpeando los mismos endpoints. Aquí lo
 * apagamos solo durante este archivo y lo restauramos al terminar.
 *
 * Usa IPs ficticias vía la cabecera de confianza (cf-connecting-ip, que
 * helpers.ts fija EXPLÍCITAMENTE como TRUSTED_IP_HEADER para el suite — en
 * producción el default es "" / sin proxy delante): cada caso estrena una
 * clave de rate-limit limpia, sin tocar IPs reales. Verifica que al superar
 * el límite la ruta responde 429.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../helpers";
import request from "supertest";

let app: import("express").Express;
const prevDisabled = process.env.RATE_LIMIT_DISABLED;

beforeAll(async () => {
  // Reactiva el limitador SOLO para este archivo (checkRateLimit lo lee por
  // request, así que basta con quitar la variable).
  delete process.env.RATE_LIMIT_DISABLED;
  app = (await import("@/server")).app;
});

afterAll(() => {
  // Restaura el bypass para no afectar a otros archivos del suite.
  if (prevDisabled !== undefined) process.env.RATE_LIMIT_DISABLED = prevDisabled;
});

function syntheticMessage() {
  return {
    name: "Remitente Demo",
    email: "remitente@test.local",
    subject: "Asunto de prueba",
    message: "Mensaje sintético para el test de rate-limit.",
  };
}

describe("rate-limit de POST /api/contact (limit 3/min)", () => {
  it("permite hasta el límite y luego responde 429 para la misma IP ficticia", async () => {
    const ip = "203.0.113.7"; // TEST-NET-3: rango de documentación, claramente sintético

    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/contact")
        .set("cf-connecting-ip", ip)
        .send(syntheticMessage());
      statuses.push(res.status);
    }

    // Las primeras 3 dentro del límite; la 4ª excede y debe ser 429.
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it("no penaliza a una IP ficticia distinta (clave de rate-limit independiente)", async () => {
    const res = await request(app)
      .post("/api/contact")
      .set("cf-connecting-ip", "203.0.113.99")
      .send(syntheticMessage());
    expect(res.status).toBe(200);
  });
});
