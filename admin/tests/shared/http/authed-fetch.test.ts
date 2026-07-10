import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { createAuthedEmergencyClient } from "@/src/shared/http/authed-fetch";
import { SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

const BACKEND = "http://backend.test";

beforeAll(() => {
  process.env.EMERGENCY_API_URL = BACKEND;
});

describe("authed-fetch", () => {
  it("devuelve null si el request no trae cookie de sesión", () => {
    const client = createAuthedEmergencyClient(new Request("http://admin.local/x"));
    expect(client).toBeNull();
  });

  it("inyecta Authorization: Bearer <jwt> desde la cookie", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BACKEND}/ping`, ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );
    const req = new Request("http://admin.local/x", {
      headers: { cookie: `${SESSION_COOKIE}=jwt123` },
    });
    const client = createAuthedEmergencyClient(req);
    expect(client).not.toBeNull();
    await client!.get("/ping");
    expect(seen).toBe("Bearer jwt123");
  });
});
