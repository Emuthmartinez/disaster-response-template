"use client";

import { createContext, useContext } from "react";

export interface SessionUser {
  id: string;
  email: string;
  roleId: string | null;
  orgId: string | null;
  isAdmin: boolean;
}

export interface AdminSessionValue {
  user: SessionUser | null;
  capabilities: string[];
  isLoading: boolean;
  /**
   * true si /me falló por algo que NO es un 401 (backend caído, red). Distinto
   * de "no logueado": la cookie puede seguir siendo válida, así que el gate
   * muestra "reintentar" en vez del login.
   */
  sessionCheckFailed: boolean;
  /** Reintenta /me a mano (botón del estado de error del gate). */
  retrySessionCheck(): void;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** true si el usuario tiene la capacidad (admin "*" cubre todo). */
  can(capability: string): boolean;
}

export const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSessionContext(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSessionContext debe usarse dentro de <AdminSessionProvider>");
  }
  return ctx;
}
