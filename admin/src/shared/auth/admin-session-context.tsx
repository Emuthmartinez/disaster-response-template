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
