import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/tests/setup";
import { adminFetch, SESSION_INVALIDATED_EVENT } from "@/src/shared/http/admin-fetch";

describe("adminFetch", () => {
  it("cierra e invalida globalmente la sesión ante cualquier 401", async () => {
    server.use(
      http.get("/api/admin/protected", () => HttpResponse.json({ error: "expired" }, { status: 401 })),
      http.post("/api/auth/logout", () => HttpResponse.json({ ok: true })),
    );
    const listener = vi.fn();
    window.addEventListener(SESSION_INVALIDATED_EVENT, listener);

    const response = await adminFetch("/api/admin/protected");

    expect(response.status).toBe(401);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_INVALIDATED_EVENT, listener);
  });
});
