"use client";

/**
 * Tabla de revisión de filas de un lote: qué quedó válido, duplicado,
 * inválido o para revisar — con errores y candidatos de dedupe visibles ANTES
 * de aplicar. Los datos vienen del BFF (/api/admin/patient-imports/:id/rows).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/src/shared/http/admin-fetch";

export interface ImportRow {
  id: string;
  rowIndex: number;
  name: string | null;
  age: number | null;
  sourceHospital: string;
  hospitalId: string | null;
  rowStatus: string;
  dedupStatus: string;
  validationErrors: string[];
  validationWarnings: string[];
  dedupCandidates: { patientId: string; name: string; reason: string }[];
  patientId: string | null;
}

// OJO: el backend emite "needs_review" (process.ts), no "review".
const ROW_STATUS_LABELS: Record<string, string> = {
  valid: "Válida",
  invalid: "Inválida",
  duplicate: "Duplicada",
  needs_review: "Revisar",
  applying: "Aplicando",
  applied: "Aplicada",
};

const ROW_STATUS_COLOR: Record<string, string> = {
  valid: "text-green-700",
  applied: "text-green-700",
  invalid: "text-red-600",
  duplicate: "text-amber-700",
  needs_review: "text-amber-700",
  applying: "text-gray-500",
};

async function fetchRows(importId: string): Promise<ImportRow[]> {
  const response = await adminFetch(
    `/api/admin/patient-imports/${encodeURIComponent(importId)}/rows?limit=500`,
  );
  const body = (await response.json().catch(() => null)) as
    | { rows?: ImportRow[]; items?: ImportRow[] }
    | ImportRow[]
    | null;
  if (!response.ok) throw new Error(`Error ${response.status} al cargar filas`);
  if (Array.isArray(body)) return body;
  return body?.rows ?? body?.items ?? [];
}

export function ImportRowsTable({
  importId,
  live = false,
}: {
  importId: string;
  /** Refetch periódico mientras el lote sigue en movimiento (apply en vuelo). */
  live?: boolean;
}) {
  const [filter, setFilter] = useState<string>("todas");
  const rows = useQuery({
    queryKey: ["patient-import-rows", importId],
    queryFn: () => fetchRows(importId),
    refetchInterval: live ? 3_000 : false,
  });

  if (rows.isLoading) return <p className="text-sm text-gray-500">Cargando filas…</p>;
  if (rows.isError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {rows.error instanceof Error ? rows.error.message : "Error al cargar filas"}
      </p>
    );
  }

  const all = rows.data ?? [];
  const visible = filter === "todas" ? all : all.filter((row) => row.rowStatus === filter);
  const statuses = [...new Set(all.map((row) => row.rowStatus))];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <label className="text-gray-500">
          Filtrar:
          <select
            className="ml-2 rounded border px-2 py-1"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="todas">todas ({all.length})</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {ROW_STATUS_LABELS[status] ?? status} (
                {all.filter((row) => row.rowStatus === status).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Hospital (fuente)</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-2">{row.rowIndex + 1}</td>
                <td className="px-3 py-2 font-medium">{row.name ?? "—"}</td>
                <td className="px-3 py-2">
                  {row.sourceHospital || "—"}
                  {!row.hospitalId && row.rowStatus === "invalid" && (
                    <span className="block text-xs text-red-600">sin hospital reconocido</span>
                  )}
                </td>
                <td className={`px-3 py-2 ${ROW_STATUS_COLOR[row.rowStatus] ?? ""}`}>
                  {ROW_STATUS_LABELS[row.rowStatus] ?? row.rowStatus}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {row.validationErrors.map((error) => (
                    <span key={error} className="block text-red-600">
                      {error}
                    </span>
                  ))}
                  {row.validationWarnings.map((warning) => (
                    <span key={warning} className="block text-amber-700">
                      {warning}
                    </span>
                  ))}
                  {row.dedupCandidates.map((candidate) => (
                    <span key={candidate.patientId} className="block">
                      posible duplicado de <strong>{candidate.name}</strong> ({candidate.reason})
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-gray-500">
                  Sin filas con ese estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
