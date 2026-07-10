"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSessionValue, SessionUser } from "./admin-session-context";
import { adminFetch, SESSION_INVALIDATED_EVENT } from "../http/admin-fetch";

type MePayload = { user: SessionUser; capabilities: string[] };

const ME_KEY = ["auth", "me"] as const;

/**
 * Estado de sesión derivado de GET /api/auth/me vía TanStack Query.
 *
 * La cookie de sesión es httpOnly → JS no puede leerla; el "estoy logueado" se
 * deriva de /me. Un 401 se trata como "no logueado" (no error). login()/logout()
 * mutan la sesión y luego invalidan la query para refrescar.
 */
async function fetchMe(): Promise<MePayload | null> {
  const res = await adminFetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`No se pudo verificar la sesión (${res.status})`);
  return (await res.json()) as MePayload;
}

export function useAdminSession(): AdminSessionValue {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });

  const user = data?.user ?? null;
  const capabilities = useMemo(() => data?.capabilities ?? [], [data]);

  useEffect(() => {
    const invalidateSession = () => {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
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
      if (!res.ok) throw new Error("Credenciales inválidas");
      await qc.invalidateQueries({ queryKey: ME_KEY });
    },
    [qc],
  );

  const logout = useCallback(async (): Promise<void> => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    qc.setQueryData(ME_KEY, null);
  }, [qc]);

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

  return { user, capabilities, isLoading, login, logout, can };
}
