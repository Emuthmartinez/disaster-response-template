"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/src/ui";
import { AdminGate } from "../src/shared/auth/admin-gate";
import { useAdminSessionContext } from "../src/shared/auth/admin-session-context";
import { MODELS } from "../src/contexts/models/model-registry";

/**
 * Shell autenticado: header con email + logout y navegación lateral filtrada por
 * capacidad (solo aparecen los modelos que el usuario puede leer; admin "*" ve
 * todo). Envuelve el contenido en AdminGate (login si no hay sesión).
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <AuthedShell>{children}</AuthedShell>
    </AdminGate>
  );
}

function AuthedShell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAdminSessionContext();
  const pathname = usePathname();
  const visible = MODELS.filter((m) => can(m.readCapability));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="text-lg font-bold">
          Panel de administración
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user?.email}</span>
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            Salir
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-48 shrink-0 border-r p-4">
          <ul className="flex flex-col gap-1">
            {visible.map((m) => (
              <NavLink key={m.path} href={`/${m.path}`} label={m.label} pathname={pathname} />
            ))}
            {can("patient:import") && (
              <NavLink href="/patient-imports" label="Importar pacientes" pathname={pathname} />
            )}
            {visible.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">Sin permisos de lectura.</li>
            )}
          </ul>

          {/* Self-service: gestionar TUS propias API keys. apikey:manage está
              sembrada en todos los roles, así que cualquier usuario invitado lo ve. */}
          {can("apikey:manage") && (
            <ul className="mt-1 flex flex-col gap-1">
              <NavLink href="/api-keys" label="API Keys" pathname={pathname} />
            </ul>
          )}

          {/* Réplica pública (SQL hub): SOLO super admin. mirror:manage NO está en
              el comodín "*" del admin normal, así que un admin corriente no lo ve. */}
          {can("mirror:manage") && (
            <ul className="mt-1 flex flex-col gap-1">
              <NavLink href="/hub-credentials" label="Réplica pública" pathname={pathname} />
            </ul>
          )}

          {/* Administración RBAC — cada enlace gateado por su capacidad. La
              gestión de usuarios (incluida la invitación) vive en /users. */}
          {(can("role:read") ||
            can("user:read") ||
            can("user:invite") ||
            can("grant:read") ||
            can("audit:read")) && (
            <>
              <h3 className="mt-6 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Administración
              </h3>
              <ul className="flex flex-col gap-1">
                {(can("user:read") || can("user:invite")) && (
                  <NavLink href="/users" label="Usuarios" pathname={pathname} />
                )}
                {can("role:read") && <NavLink href="/roles" label="Roles" pathname={pathname} />}
                {can("grant:read") && <NavLink href="/grants" label="Grants" pathname={pathname} />}
                {can("audit:read") && <NavLink href="/audit" label="Auditoría" pathname={pathname} />}
              </ul>
            </>
          )}
        </nav>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href;
  return (
    <li>
      <Link
        href={href}
        className={[
          "block rounded px-3 py-2 text-sm",
          active ? "bg-gray-900 text-white" : "hover:bg-gray-100",
        ].join(" ")}
      >
        {label}
      </Link>
    </li>
  );
}
