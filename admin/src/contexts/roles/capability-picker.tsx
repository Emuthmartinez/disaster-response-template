"use client";

import { useMemo } from "react";
import { useCapabilities, type Capability } from "./use-roles";

function groupByCategory(caps: Capability[]): Map<string, Capability[]> {
  const m = new Map<string, Capability[]>();
  for (const c of caps) {
    const list = m.get(c.category) ?? [];
    list.push(c);
    m.set(c.category, list);
  }
  return m;
}

/**
 * Selector de capacidades agrupado por categoría (checkbox). Controlado:
 * el padre posee el Set de seleccionadas. Reutilizado por crear y editar rol.
 */
export function CapabilityPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { data: caps, isLoading } = useCapabilities();
  const groups = useMemo(() => groupByCategory(caps ?? []), [caps]);

  if (isLoading) return <p className="text-sm text-gray-500">Cargando catálogo…</p>;

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([category, list]) => (
        <div key={category}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {category}
          </h4>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {list.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={() => onToggle(c.key)}
                />
                <span className="font-mono text-xs">{c.key}</span>
                <span className="text-gray-500">— {c.description}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
