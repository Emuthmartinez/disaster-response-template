"use client";

import { RequireCapability } from "../../src/shared/auth/admin-gate";
import { RolesList } from "../../src/contexts/roles/roles-list";
import { RoleCreateForm } from "../../src/contexts/roles/role-create-form";

/**
 * Pantalla de administración de roles: lista (role:read) + creación
 * (role:create). Cada bloque gateado por su capacidad (UX; el backend hace la
 * autorización real).
 */
export function RolesAdmin() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Roles</h1>

      <RequireCapability
        cap="role:read"
        fallback={<p className="mt-4 text-sm text-red-600">No tienes permiso para ver roles (role:read).</p>}
      >
        <RolesList />
      </RequireCapability>

      <RequireCapability cap="role:create">
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Crear rol</h2>
          <RoleCreateForm />
        </section>
      </RequireCapability>
    </div>
  );
}
