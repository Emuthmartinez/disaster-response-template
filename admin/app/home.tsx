"use client";

import Link from "next/link";
import { useAdminSessionContext } from "../src/shared/auth/admin-session-context";
import { MODELS } from "../src/contexts/models/model-registry";

/** Landing del panel: tarjetas de los modelos que el usuario puede leer. */
export function Home() {
  const { can } = useAdminSessionContext();
  const visible = MODELS.filter((m) => can(m.readCapability));

  return (
    <div>
      <h1 className="text-2xl font-bold">Inicio</h1>
      <p className="mt-1 text-sm text-gray-500">Selecciona un módulo para administrar.</p>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          Tu cuenta no tiene capacidades de lectura asignadas. Contacta a un administrador.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {visible.map((m) => (
            <Link
              key={m.path}
              href={`/${m.path}`}
              className="rounded border p-4 transition hover:bg-gray-50"
            >
              <span className="font-semibold">{m.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
