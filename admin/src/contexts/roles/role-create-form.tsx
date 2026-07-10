"use client";

import { useState, type FormEvent } from "react";
import { Input, Button } from "@/src/ui";
import { useCreateRole } from "./use-roles";
import { CapabilityPicker } from "./capability-picker";

/** Formulario de creación de rol: nombre + descripción + capacidades. */
export function RoleCreateForm() {
  const createRole = useCreateRole();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);

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
    setDone(null);
    const role = await createRole.mutateAsync({
      name,
      description: description || undefined,
      capabilities: [...selected],
    });
    setDone(role.name);
    setName("");
    setDescription("");
    setSelected(new Set());
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex max-w-2xl flex-col gap-4">
      <Input label="Nombre del rol" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Descripción (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <fieldset className="rounded border p-3">
        <legend className="px-1 text-sm font-semibold">
          Capacidades ({selected.size} seleccionadas)
        </legend>
        <CapabilityPicker selected={selected} onToggle={toggle} />
      </fieldset>

      {createRole.isError && (
        <p role="alert" className="text-sm text-red-600">
          {createRole.error instanceof Error ? createRole.error.message : "Error al crear el rol."}
        </p>
      )}
      {done && <p className="text-sm text-green-700">Rol “{done}” creado.</p>}

      <Button type="submit" disabled={createRole.isPending || !name}>
        {createRole.isPending ? "Creando…" : "Crear rol"}
      </Button>
    </form>
  );
}
