"use client";

import { useState } from "react";
import { Button } from "@/src/ui";
import { useAdminSessionContext } from "../../shared/auth/admin-session-context";
import { useRoles, useDeleteRole, type Role } from "./use-roles";
import { RoleEditForm } from "./role-edit-form";

/** Lista de roles con acciones (editar / eliminar) gateadas por capacidad. */
export function RolesList() {
  const { data: roles, isLoading, isError } = useRoles();
  const { can } = useAdminSessionContext();
  const deleteRole = useDeleteRole();
  const [editingId, setEditingId] = useState<string | null>(null);

  const canEdit = can("role:edit");
  const canDelete = can("role:delete");
  const showActions = canEdit || canDelete;

  if (isLoading) return <p className="mt-4 text-sm text-gray-500">Cargando roles…</p>;
  if (isError) return <p className="mt-4 text-sm text-red-600">No se pudieron cargar los roles.</p>;

  async function onDelete(role: Role) {
    if (!confirm(`¿Eliminar el rol “${role.name}”? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteRole.mutateAsync(role.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo eliminar el rol.");
    }
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2 font-semibold">Nombre</th>
            <th className="px-3 py-2 font-semibold">Descripción</th>
            <th className="px-3 py-2 font-semibold">Capacidades</th>
            <th className="px-3 py-2 font-semibold">Sistema</th>
            {showActions && <th className="px-3 py-2 font-semibold">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {(roles ?? []).map((r) =>
            editingId === r.id ? (
              <tr key={r.id} className="border-b last:border-0">
                <td colSpan={showActions ? 5 : 4} className="px-3 py-3">
                  <RoleEditForm role={r} onDone={() => setEditingId(null)} />
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-gray-600">{r.description || "—"}</td>
                <td className="px-3 py-2">
                  {r.capabilities.includes("*") ? "todas (*)" : r.capabilities.length}
                </td>
                <td className="px-3 py-2">{r.isSystem ? "sí" : "no"}</td>
                {showActions && (
                  <td className="px-3 py-2">
                    {r.isSystem ? (
                      <span className="text-xs text-gray-400">protegido</span>
                    ) : (
                      <div className="flex gap-2">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setEditingId(r.id)}
                          >
                            Editar
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={deleteRole.isPending}
                            onClick={() => onDelete(r)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ),
          )}
          {(roles ?? []).length === 0 && (
            <tr>
              <td colSpan={showActions ? 5 : 4} className="px-3 py-6 text-center text-gray-500">
                Sin roles todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
