"use client";

import { type ReactNode } from "react";
import { Button } from "@/src/ui";
import { useAdminSessionContext } from "./admin-session-context";
import { LoginForm } from "./login-form";

interface AdminGateProps {
  children: ReactNode;
}

/**
 * Gate de autenticación. Cuatro estados, en este orden:
 *   - resolviendo /me            → placeholder "Cargando…"
 *   - /me falló (5xx/red)        → aviso + reintentar (la sesión puede seguir
 *                                  viva; mostrar el login aquí sería mentir)
 *   - sin sesión (401 limpio)    → LoginForm
 *   - autenticado                → children
 * El estado vive en AdminSessionProvider (ancestro); este componente solo lo lee.
 */
export function AdminGate({ children }: AdminGateProps) {
  const { user, isLoading, sessionCheckFailed, retrySessionCheck, login } =
    useAdminSessionContext();

  if (isLoading) {
    return <p className="mt-4 text-sm text-gray-500">Cargando…</p>;
  }

  if (!user && sessionCheckFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
        <div
          role="alert"
          className="w-full max-w-sm rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm"
        >
          <h1 className="text-lg font-bold text-gray-900">No se pudo verificar la sesión</h1>
          <p className="mt-2 text-sm text-gray-500">
            El servicio no respondió. Suele ser pasajero: se reintenta solo cada pocos
            segundos, o puedes forzarlo ahora.
          </p>
          <Button type="button" className="mt-4" onClick={retrySessionCheck}>
            Reintentar
          </Button>
        </div>
      </div>
    );
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
