import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

const BACKEND = "http://backend.test";

beforeAll(() => {
  process.env.EMERGENCY_API_URL = BACKEND;
});

async function callModels(path: string, cookie?: string): Promise<Response> {
  const { GET } = await import("@/app/api/models/[path]/route");
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return GET(new Request(`http://admin.local/api/models/${path}`, { headers }), {
    params: Promise.resolve({ path }),
  });
}

describe("BFF /api/models/[path]", () => {
  it("404 para un modelo desconocido (antes de tocar el backend)", async () => {
    const res = await callModels("bogus", "tok");
    expect(res.status).toBe(404);
  });

  it("401 sin cookie de sesión", async () => {
    const res = await callModels("reports");
    expect(res.status).toBe(401);
  });

  it("200 + items cuando hay sesión y el backend responde", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/reports`, ({ request }) => {
        // el BFF debe reenviar el JWT como Bearer
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        return HttpResponse.json({ items: [{ id: "1" }, { id: "2" }] });
      }),
    );
    const res = await callModels("reports", "tok");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("403 cuando el backend niega por capacidad", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/hospitals`, () =>
        HttpResponse.json({ error: "forbidden" }, { status: 403 }),
      ),
    );
    const res = await callModels("hospitals", "tok");
    expect(res.status).toBe(403);
  });

  it("401 cuando el backend dice no-autenticado (token inválido)", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/reports`, () =>
        HttpResponse.json({ error: "no" }, { status: 401 }),
      ),
    );
    const res = await callModels("reports", "stale");
    expect(res.status).toBe(401);
  });

  it("502 ante error inesperado del backend", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/reports`, () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const res = await callModels("reports", "tok");
    expect(res.status).toBe(502);
  });
});
