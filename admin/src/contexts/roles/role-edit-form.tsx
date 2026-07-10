"use client";

import { useState, type FormEvent } from "react";
import { Input, Button } from "@/src/ui";
import { useUpdateRole, type Role } from "./use-roles";
import { CapabilityPicker } from "./capability-picker";

/** Editor inline de un rol existente (nombre, descripción, capacidades). */
export function RoleEditForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const updateRole = useUpdateRole();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [selected, setSelected] = useState<Set<string>>(new Set(role.capabilities));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await updateRole.mutateAsync({
      id: role.id,
      input: { name, description, capabilities: [...selected] },
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border bg-gray-50 p-4">
      <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <fieldset className="rounded border bg-white p-3">
        <legend className="px-1 text-sm font-semibold">
          Capacidades ({selected.size})
        </legend>
        <CapabilityPicker selected={selected} onToggle={toggle} />
      </fieldset>

      {updateRole.isError && (
        <p role="alert" className="text-sm text-red-600">
          {updateRole.error instanceof Error ? updateRole.error.message : "Error al guardar."}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={updateRole.isPending || !name}>
          {updateRole.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
