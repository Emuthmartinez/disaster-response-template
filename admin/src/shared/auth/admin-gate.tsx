"use client";

import { type ReactNode } from "react";
import { useAdminSessionContext } from "./admin-session-context";
import { LoginForm } from "./login-form";

interface AdminGateProps {
  children: ReactNode;
}

/**
 * Gate de autenticación. Mientras resuelve /me muestra un placeholder; sin
 * sesión muestra el LoginForm; autenticado renderiza children. El estado vive
 * en AdminSessionProvider (ancestro); este componente solo lo lee.
 */
export function AdminGate({ children }: AdminGateProps) {
  const { user, isLoading, login } = useAdminSessionContext();

  if (isLoading) {
    return <p className="mt-4 text-sm text-gray-500">Cargando…</p>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
        <LoginForm onSubmit={login} />
      </div>
    );
  }

  return <>{children}</>;
}

interface RequireCapabilityProps {
  cap: string;
  children: ReactNode;
  /** Qué mostrar si falta la capacidad. Default: nada. */
  fallback?: ReactNode;
}

/**
 * Gate por capacidad para paneles/acciones individuales. Admin ("*") pasa todo.
 * NO es seguridad real (eso lo hace el backend con requireCapability); es UX:
 * oculta lo que el usuario no puede usar.
 */
export function RequireCapability({ cap, children, fallback = null }: RequireCapabilityProps) {
  const { can } = useAdminSessionContext();
  return can(cap) ? <>{children}</> : <>{fallback}</>;
}

export function RequireAnyCapability({
  caps,
  children,
  fallback = null,
}: {
  caps: readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAdminSessionContext();
  return caps.some(can) ? <>{children}</> : <>{fallback}</>;
}
