import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

const BACKEND = "http://backend.test";

beforeAll(() => {
  process.env.EMERGENCY_API_URL = BACKEND;
});

function reqWithCookie(url: string, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return new Request(url, { method: url.includes("logout") ? "POST" : "GET", headers });
}

describe("BFF /api/auth/me", () => {
  it("401 sin cookie", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET(reqWithCookie("http://admin.local/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("200 + user/capabilities con sesión válida (Bearer reenviado)", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/auth/me`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        return HttpResponse.json({
          user: { id: "u1", email: "a@b.com", roleId: null, orgId: null, isAdmin: true },
          capabilities: ["*"],
        });
      }),
    );
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET(reqWithCookie("http://admin.local/api/auth/me", "tok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("a@b.com");
    expect(body.capabilities).toEqual(["*"]);
  });

  it("401 si el backend dice token inválido", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/auth/me`, () =>
        HttpResponse.json({ error: "no" }, { status: 401 }),
      ),
    );
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET(reqWithCookie("http://admin.local/api/auth/me", "stale"));
    expect(res.status).toBe(401);
  });
});

describe("BFF /api/auth/logout", () => {
  it("200 y limpia la cookie de sesión (Max-Age=0)", async () => {
    server.use(http.post(`${BACKEND}/api/public/auth/logout`, () => HttpResponse.json({ ok: true })));
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST(reqWithCookie("http://admin.local/api/auth/logout", "tok"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("max-age=0");
  });

  it("200 incluso sin sesión (idempotente)", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST(reqWithCookie("http://admin.local/api/auth/logout"));
    expect(res.status).toBe(200);
  });
});
