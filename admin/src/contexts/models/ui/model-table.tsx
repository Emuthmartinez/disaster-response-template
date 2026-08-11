"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button, Input } from "@/src/ui";
import { useModelList, useModelMutation } from "./use-model-list";
import type { ModelConfig, ModelField } from "../model-registry";
import type { ModelRow } from "../application/models-gateway";
import { useAdminSessionContext } from "../../../shared/auth/admin-session-context";

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseFieldValue(field: ModelField, value: unknown): unknown {
  if (field.type === "number") return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function matchesQuery(row: ModelRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return Object.values(row).some((v) => renderCell(v).toLowerCase().includes(needle));
}

/**
 * Tabla read-only genérica para un modelo. Lee columnas del model-registry,
 * lista vía /api/models/<path>, con búsqueda client-side. F1: solo lectura.
 */
export function ModelTable({ model }: { model: ModelConfig }) {
  const { data, isLoading, isError, error } = useModelList(model.path);
  const mutation = useModelMutation(model.path);
  const { can } = useAdminSessionContext();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ModelRow | null>(null);
  const canCreate = Boolean(model.createFields && can(`${model.capabilityRoot}:create`));
  const canEdit = Boolean(model.editFields && can(`${model.capabilityRoot}:edit`));
  const canDelete = Boolean(model.canDelete && can(`${model.capabilityRoot}:delete`));
  const hasActions = canEdit || canDelete;

  const rows = useMemo(
    () => (data ?? []).filter((r) => matchesQuery(r, query)),
    [data, query],
  );

  if (isLoading) return <p className="mt-4 text-sm text-gray-500">Cargando {model.label}…</p>;
  if (isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-600">
        Error al cargar {model.label}: {error instanceof Error ? error.message : "desconocido"}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <Input
          label=""
          type="search"
          placeholder={`Buscar en ${model.label}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-sm text-gray-500">{rows.length} resultado(s)</span>
      </div>
      {canCreate && (
        <ModelForm
          fields={model.createFields!}
          submitLabel="Crear"
          pending={mutation.isPending}
          onSubmit={(input) => mutation.mutate({ method: "POST", input })}
        />
      )}
      {mutation.error && <p className="text-sm text-red-600">{mutation.error.message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              {model.columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-semibold">
                  {c.label}
                </th>
              ))}
              {hasActions && <th className="px-3 py-2 font-semibold">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={model.columns.length + (hasActions ? 1 : 0)}
                  className="px-3 py-6 text-center text-gray-500"
                >
                  Sin datos.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={renderCell(row.id) + String(i)} className="border-b last:border-0">
                  {model.columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top">
                      {renderCell(row[c.key])}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="flex gap-2 px-3 py-2">
                      {canEdit && (
                        <Button type="button" variant="ghost" onClick={() => setEditing(row)}>
                          Editar
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            mutation.mutate({ method: "DELETE", id: renderCell(row.id) })
                          }
                        >
                          Eliminar
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editing && model.editFields && (
        <ModelForm
          fields={model.editFields}
          initial={editing}
          submitLabel="Guardar"
          pending={mutation.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            mutation.mutate(
              { method: "PATCH", id: renderCell(editing.id), input },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}
    </div>
  );
}

/**
 * <select> poblado con las filas de otro modelo del registro. Componente
 * propio para poder usar el hook de lista por instancia (uno por campo).
 * El value que viaja al backend es el `id`; la persona ve el nombre.
 */
function SelectModelField({
  field,
  value,
  onChange,
}: {
  field: ModelField;
  value: string;
  onChange: (next: string) => void;
}) {
  const { data, isLoading, isError } = useModelList(field.optionsModel ?? "");
  const labelKey = field.optionLabelKey ?? "name";

  // Si las opciones no cargan (p.ej. un rol con patient:create pero sin
  // hospital:read), degradar a entrada manual del ID: peor UX, pero el flujo
  // no queda BLOQUEADO. El backend valida el ID igual.
  if (isError) {
    return (
      <Input
        label={`${field.label} (ID — no se pudieron cargar las opciones)`}
        required={field.required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  // NUNCA disabled: un control deshabilitado queda FUERA de la validación
  // required de HTML5 y el submit pasaría con el campo vacío mientras carga.
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{field.label}</span>
      <select
        className="w-full rounded border px-3 py-2"
        required={field.required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {isLoading ? "Cargando opciones…" : `— Elige ${field.label.toLowerCase()} —`}
        </option>
        {(data ?? []).map((row) => (
          <option key={renderCell(row.id)} value={renderCell(row.id)}>
            {renderCell(row[labelKey])}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModelForm({
  fields,
  initial = {},
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  fields: readonly ModelField[];
  initial?: ModelRow;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: ModelRow) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ModelRow>(() =>
    Object.fromEntries(fields.map((field) => [field.key, initial[field.key] ?? ""])),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = Object.fromEntries(
      fields
        .filter((field) => values[field.key] !== "")
        .map((field) => [field.key, parseFieldValue(field, values[field.key])]),
    );
    onSubmit(input);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded border bg-gray-50 p-3 sm:grid-cols-2">
      {fields.map((field) =>
        field.type === "select-model" ? (
          <SelectModelField
            key={field.key}
            field={field}
            value={renderCell(values[field.key]).replace("—", "")}
            onChange={(next) =>
              setValues((current) => ({ ...current, [field.key]: next }))
            }
          />
        ) : (
          <Input
            key={field.key}
            label={field.label}
            type={field.type ?? "text"}
            required={field.required}
            value={renderCell(values[field.key]).replace("—", "")}
            onChange={(event) =>
              setValues((current) => ({ ...current, [field.key]: event.target.value }))
            }
          />
        ),
      )}
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
