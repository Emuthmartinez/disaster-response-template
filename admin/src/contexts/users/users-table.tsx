"use client";

import { useMemo, useState } from "react";
import { Button } from "@/src/ui";
import { useAdminSessionContext } from "../../shared/auth/admin-session-context";
import { useRoles } from "../roles/use-roles";
import { useUsers, useUpdateUser, useSuspendUser, type User, type UserStatus } from "./use-users";

const STATUS_LABEL: Record<UserStatus, string> = {
  invited: "Invitado",
  active: "Activo",
  disabled: "Suspendido",
};

const STATUS_STYLE: Record<UserStatus, string> = {
  invited: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  disabled: "bg-gray-200 text-gray-600",
};

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const FILTERS: Array<{ key: "all" | UserStatus; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "invited", label: "Invitados" },
  { key: "disabled", label: "Suspendidos" },
];

/** Tabla de gestión de usuarios: estado, rol, suspender/reactivar. Sin hard delete. */
export function UsersTable() {
  const { data: users, isLoading, isError } = useUsers();
  const { data: roles } = useRoles();
  const { user: me, can } = useAdminSessionContext();
  const updateUser = useUpdateUser();
  const suspendUser = useSuspendUser();

  const [filter, setFilter] = useState<"all" | UserStatus>("all");
  const canEdit = can("user:edit");
  const canDelete = can("user:delete");

  const roleName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles ?? []) m.set(r.id, r.name);
    return m;
  }, [roles]);

  const rows = useMemo(
    () => (users ?? []).filter((u) => filter === "all" || u.status === filter),
    [users, filter],
  );

  if (isLoading) return <p className="mt-4 text-sm text-gray-500">Cargando usuarios…</p>;
  if (isError) return <p className="mt-4 text-sm text-red-600">No se pudieron cargar los usuarios.</p>;

  async function changeRole(u: User, roleId: string) {
    try {
      await updateUser.mutateAsync({ id: u.id, input: { roleId: roleId || null } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo cambiar el rol.");
    }
  }

  async function suspend(u: User) {
    if (!confirm(`¿Suspender a ${u.email}? Podrás reactivarlo después (no se elimina).`)) return;
    try {
      await suspendUser.mutateAsync(u.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo suspender.");
    }
  }

  async function reactivate(u: User) {
    try {
      await updateUser.mutateAsync({ id: u.id, input: { status: "active" } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo reactivar.");
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded px-3 py-1 text-sm ${
              filter === f.key ? "bg-gray-900 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Rol</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              {(canEdit || canDelete) && <th className="px-3 py-2 font-semibold">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = u.id === me?.id;
              return (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {u.email} {isSelf && <span className="text-xs text-gray-400">(tú)</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.name || "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit && !isSelf ? (
                      <select
                        value={u.roleId ?? ""}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="rounded border px-2 py-1 text-sm"
                      >
                        <option value="">— Sin rol —</option>
                        {(roles ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (u.roleId && roleName.get(u.roleId)) || "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={u.status} />
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-3 py-2">
                      {isSelf ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <div className="flex gap-2">
                          {u.status === "disabled"
                            ? canEdit && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={updateUser.isPending}
                                  onClick={() => reactivate(u)}
                                >
                                  Reactivar
                                </Button>
                              )
                            : canDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={suspendUser.isPending}
                                  onClick={() => suspend(u)}
                                >
                                  Suspender
                                </Button>
                              )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit || canDelete ? 5 : 4} className="px-3 py-6 text-center text-gray-500">
                  Sin usuarios en este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
