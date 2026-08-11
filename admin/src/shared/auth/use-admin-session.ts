"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSessionValue, SessionUser } from "./admin-session-context";
import { SESSION_INVALIDATED_EVENT } from "../http/admin-fetch";

type MePayload = { user: SessionUser; capabilities: string[] };

const ME_KEY = ["auth", "me"] as const;

/**
 * Estado de sesión derivado de GET /api/auth/me vía TanStack Query.
 *
 * La cookie de sesión es httpOnly → JS no puede leerla; el "estoy logueado" se
 * deriva de /me. Tres estados, no dos:
 *   - 401            → null ("no logueado"; estado normal, muestra login)
 *   - 5xx / red      → throw ("no se pudo VERIFICAR"; reintenta, NO muestra login)
 *   - 200            → sesión
 *
 * /me usa fetch plano, NUNCA adminFetch: el hook de 401 de adminFetch dispara
 * logout + invalidación global, y en el bootstrap sin sesión eso limpiaba la
 * cache con la propia query de /me en vuelo — la query quedaba huérfana y el
 * gate se congelaba en "Cargando…" para siempre.
 */
async function fetchMe(): Promise<MePayload | null> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`No se pudo verificar la sesión (${res.status})`);
  return (await res.json()) as MePayload;
}

/** Extrae el mensaje de error del body del BFF; cae al fallback si no hay. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error.length > 0 ? body.error : fallback;
}

export function useAdminSession(): AdminSessionValue {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    // Un fallo transitorio del backend (Neon fría, 502) no es "no logueado":
    // reintenta con backoff antes de rendirse, y aun entonces el gate muestra
    // "reintentar", no el login.
    retry: 2,
    staleTime: 60_000,
    // Mientras /me esté en error, reintenta solo cada 10 s: un blip de 30 s
    // del backend se autocura sin que nadie pulse nada.
    refetchInterval: (query) => (query.state.status === "error" ? 10_000 : false),
  });

  const user = data?.user ?? null;
  const capabilities = useMemo(() => data?.capabilities ?? [], [data]);

  // Sesión invalidada a MITAD de sesión (un 401 en un endpoint de datos, vía
  // adminFetch). Marca /me como null y purga el resto de queries — sin qc.clear():
  // clear() arrasa también la query de /me y deja a su observer colgado.
  useEffect(() => {
    const invalidateSession = () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    };
    window.addEventListener(SESSION_INVALIDATED_EVENT, invalidateSession);
    return () => window.removeEventListener(SESSION_INVALIDATED_EVENT, invalidateSession);
  }, [qc]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      // El BFF distingue 401 (credenciales) de 429 (rate limit) y 502 (backend
      // caído); propagar su mensaje evita culpar a la contraseña por un 502.
      if (!res.ok) throw new Error(await readErrorMessage(res, "Credenciales inválidas."));
      await qc.invalidateQueries({ queryKey: ME_KEY });
    },
    [qc],
  );

  const logout = useCallback(async (): Promise<void> => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    qc.setQueryData(ME_KEY, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
  }, [qc]);

  const retrySessionCheck = useCallback((): void => {
    void refetch();
  }, [refetch]);

  // Capacidades FUERA del comodín "*": aunque un admin tenga "*", estas exigen
  // estar presentes EXPLÍCITAMENTE (las concede el backend solo a super admins).
  // Espeja el corte de auth/resolve.ts del backend. Ver RFC 0006 (mirror:manage).
  const can = useCallback(
    (capability: string): boolean => {
      if (capability === "mirror:manage") return capabilities.includes(capability);
      return capabilities.includes("*") || capabilities.includes(capability);
    },
    [capabilities],
  );

  return {
    user,
    capabilities,
    isLoading,
    sessionCheckFailed: isError,
    retrySessionCheck,
    login,
    logout,
    can,
  };
}
