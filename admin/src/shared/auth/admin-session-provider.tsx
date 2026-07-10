"use client";

import type { ReactNode } from "react";
import { useAdminSession } from "./use-admin-session";
import { AdminSessionContext } from "./admin-session-context";

interface AdminSessionProviderProps {
  children: ReactNode;
}

/**
 * Owns the session state (via useAdminSession) and provides user, capabilities,
 * login/logout and the `can()` capability check to children through context.
 */
export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const session = useAdminSession();
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}
