"use client";

import { getModel } from "../../src/contexts/models/model-registry";
import { RequireCapability } from "../../src/shared/auth/admin-gate";
import { ModelTable } from "../../src/contexts/models/ui/model-table";

/**
 * Página de un modelo: gateada por su capacidad de lectura (UX; el backend hace
 * la autorización real). Si falta la capacidad, muestra un aviso en vez de la
 * tabla.
 */
export function ModelPage({ path }: { path: string }) {
  const model = getModel(path);
  if (!model) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold">{model.label}</h1>
      <RequireCapability
        cap={model.readCapability}
        fallback={
          <p className="mt-4 text-sm text-red-600">
            No tienes permiso para ver {model.label} ({model.readCapability}).
          </p>
        }
      >
        <ModelTable model={model} />
      </RequireCapability>
    </div>
  );
}
