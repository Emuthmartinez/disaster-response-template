import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

const BACKEND = "http://backend.test";

beforeAll(() => {
  process.env.EMERGENCY_API_URL = BACKEND;
});

async function callLogin(body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(
    new Request("http://admin.local/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("BFF /api/auth/login", () => {
  it("200 + emite cookie httpOnly de sesión cuando el backend acepta", async () => {
    server.use(
      http.post(`${BACKEND}/api/public/auth/login`, () =>
        HttpResponse.json({ ok: true, token: "jwt.from.backend" }),
      ),
    );

    const res = await callLogin({ email: "a@b.com", password: "secret" });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=jwt.from.backend`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    // el token NO viaja en el body al navegador
    expect(await res.json()).toEqual({ ok: true });
  });

  it("401 cuando el backend rechaza credenciales", async () => {
    server.use(
      http.post(`${BACKEND}/api/public/auth/login`, () =>
        HttpResponse.json({ error: "no" }, { status: 401 }),
      ),
    );
    const res = await callLogin({ email: "a@b.com", password: "bad" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("400 con body inválido (sin email/password)", async () => {
    const res = await callLogin({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("429 cuando el backend rate-limitea (propaga, no 502)", async () => {
    server.use(
      http.post(`${BACKEND}/api/public/auth/login`, () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );
    const res = await callLogin({ email: "a@b.com", password: "x" });
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("502 si el backend devuelve error inesperado", async () => {
    server.use(
      http.post(`${BACKEND}/api/public/auth/login`, () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const res = await callLogin({ email: "a@b.com", password: "x" });
    expect(res.status).toBe(502);
  });
});
