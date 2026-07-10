import { HttpResponse, http } from "msw";
import { beforeAll, describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

const BACKEND = "http://backend.test";
const authHeaders = { cookie: `${SESSION_COOKIE}=tok`, "content-type": "application/json" };

beforeAll(() => {
  process.env.EMERGENCY_API_URL = BACKEND;
});

describe("BFF patient imports", () => {
  it("crea el lote y preserva 202", async () => {
    server.use(
      http.post(`${BACKEND}/api/public/patient-imports`, async ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        expect(await request.json()).toEqual({ rows: [{ name: "Paciente Demo" }] });
        return HttpResponse.json({ import: { id: "batch-1" }, jobId: "job-1" }, { status: 202 });
      }),
    );
    const { POST } = await import("@/app/api/admin/patient-imports/route");
    const response = await POST(
      new Request("http://admin.local/api/admin/patient-imports", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ rows: [{ name: "Paciente Demo" }] }),
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ jobId: "job-1" });
  });
});

describe("BFF grants", () => {
  it("lista grants y conserva el filtro de usuario", async () => {
    server.use(
      http.get(`${BACKEND}/api/public/grants`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("userId")).toBe("user-1");
        return HttpResponse.json({ items: [{ id: "grant-1" }] });
      }),
    );
    const { GET } = await import("@/app/api/admin/grants/route");
    const response = await GET(
      new Request("http://admin.local/api/admin/grants?userId=user-1", {
        headers: authHeaders,
      }),
    );
    expect(await response.json()).toEqual([{ id: "grant-1" }]);
  });
});
