/**
 * Tests de useAdminSession — en particular las regresiones del gate congelado:
 *
 * 1. Un /me 401 (bootstrap sin sesión) debe resolver a "no logueado" SIN
 *    disparar POST /api/auth/logout (eso hacía adminFetch y su invalidación
 *    global dejaba la query de /me huérfana → "Cargando…" eterno).
 * 2. SESSION_INVALIDATED_EVENT con /me en vuelo no debe congelar el hook.
 * 3. Un /me 5xx es "no se pudo verificar" (sessionCheckFailed), NO "no logueado".
 * 4. login() propaga el mensaje real del BFF (502 ≠ credenciales inválidas).
 */
import { HttpResponse, http, delay } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { server } from "@/tests/setup";
import { useAdminSession } from "@/src/shared/auth/use-admin-session";
import { SESSION_INVALIDATED_EVENT } from "@/src/shared/http/admin-fetch";

function wrapperWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const me = { user: { id: "u1", email: "a@b.co", roleId: "r1", orgId: null, isAdmin: true } };

describe("useAdminSession", () => {
  it("un 401 de /me es 'no logueado' y NO dispara logout", async () => {
    const logoutSpy = vi.fn();
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })),
      http.post("/api/auth/logout", () => {
        logoutSpy();
        return HttpResponse.json({ ok: true });
      }),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useAdminSession(), { wrapper: wrapperWith(qc) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.sessionCheckFailed).toBe(false);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it("SESSION_INVALIDATED_EVENT con /me en vuelo no congela el gate (regresión)", async () => {
    server.use(
      http.get("/api/auth/me", async () => {
        await delay(150);
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useAdminSession(), { wrapper: wrapperWith(qc) });

    // Simula lo que hace adminFetch ante un 401 de un endpoint de datos,
    // exactamente mientras la query de /me sigue en vuelo.
    act(() => {
      window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT));
    });

    // El bug: isLoading se quedaba en true para siempre. Debe resolver.
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });
    expect(result.current.user).toBeNull();
  });

  it("un 5xx de /me marca sessionCheckFailed, no 'sin sesión'", { timeout: 10_000 }, async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({ error: "Upstream service error" }, { status: 502 }),
      ),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useAdminSession(), { wrapper: wrapperWith(qc) });

    // La política real del hook (retry: 2 con backoff exponencial) tarda ~3 s
    // en agotar los 3 intentos antes de declarar el error — de ahí el timeout.
    await waitFor(() => expect(result.current.sessionCheckFailed).toBe(true), { timeout: 8000 });
    expect(result.current.user).toBeNull();
  });

  it("con sesión válida expone user y can()", async () => {
    server.use(
      http.get("/api/auth/me", () =>
        HttpResponse.json({ ...me, capabilities: ["hospital:read"] }),
      ),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useAdminSession(), { wrapper: wrapperWith(qc) });

    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.can("hospital:read")).toBe(true);
    expect(result.current.can("user:read")).toBe(false);
  });

  it("login() propaga el mensaje real del BFF en un 502", async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 })),
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          { error: "El servicio de autenticación no respondió correctamente." },
          { status: 502 },
        ),
      ),
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useAdminSession(), { wrapper: wrapperWith(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.login("a@b.co", "pw")).rejects.toThrow(
      "El servicio de autenticación no respondió correctamente.",
    );
  });
});
