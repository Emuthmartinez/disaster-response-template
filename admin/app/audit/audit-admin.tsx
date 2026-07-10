"use client";

import { useCallback, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Input } from "@/src/ui";
import { RequireCapability } from "../../src/shared/auth/admin-gate";
import { adminFetch } from "@/src/shared/http/admin-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface AuditEntry {
  id: number;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TARGET_TYPES = [
  { value: "", label: "Todos" },
  { value: "report", label: "Reportes" },
  { value: "missing", label: "Desaparecidos" },
  { value: "hospital", label: "Hospitales" },
  { value: "patient", label: "Pacientes" },
  { value: "donation", label: "Donaciones" },
  { value: "chat", label: "Chat" },
  { value: "contact", label: "Contacto" },
  { value: "user", label: "Usuarios" },
  { value: "role", label: "Roles" },
  { value: "grant", label: "Grants" },
];

function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString("es", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "hace unos segundos";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months}mes(es)`;
}

function MetadataCell({ metadata }: { metadata: unknown }) {
  const [open, setOpen] = useState(false);
  if (metadata === null || metadata === undefined) return <span className="text-gray-400">—</span>;
  const preview = JSON.stringify(metadata);
  const short = preview.length > 40 ? preview.slice(0, 40) + "…" : preview;
  return (
    <span className="font-mono text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-left hover:underline">
        {open ? preview : short}
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

const PAGE_LIMIT = 50;

export function AuditAdmin() {
  const [targetType, setTargetType] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [actorQuery, setActorQuery] = useState("");

  const buildUrl = useCallback(
    (cursor: number | null) => {
      const params = new URLSearchParams();
      if (targetType) params.set("targetType", targetType);
      if (actorQuery.trim()) params.set("actorUserId", actorQuery.trim());
      params.set("limit", String(PAGE_LIMIT));
      if (cursor) params.set("before", String(cursor));
      return `/api/admin/audit?${params.toString()}`;
    },
    [targetType, actorQuery],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["admin-audit", targetType, actorQuery],
    queryFn: async ({ pageParam }) => {
      const res = await adminFetch(buildUrl(pageParam));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<AuditEntry[]>;
    },
    initialPageParam: null as number | null,
    getNextPageParam: (page) =>
      page.length === PAGE_LIMIT ? (page[page.length - 1]?.id ?? undefined) : undefined,
  });

  const entries = data?.pages.flat() ?? [];
  const filtered = actionQuery
    ? entries.filter((e) => e.action.toLowerCase().includes(actionQuery.toLowerCase()))
    : entries;

  function handleApplyFilters() {
    void refetch();
  }

  return (
    <RequireCapability
      cap="audit:read"
      fallback={
        <p className="mt-4 text-sm text-red-600">
          No tienes permiso para ver la auditoría (audit:read).
        </p>
      }
    >
      <div>
        <h1 className="text-2xl font-bold">Auditoría</h1>
        <p className="mt-1 text-sm text-gray-500">Bitácora de acciones del sistema.</p>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="audit-target-type" className="mb-1 block text-sm font-medium text-gray-700">
              Tipo de objeto
            </label>
            <select
              id="audit-target-type"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="block w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Acción"
            type="search"
            placeholder="Filtrar por acción…"
            value={actionQuery}
            onChange={(e) => setActionQuery(e.target.value)}
            className="max-w-xs"
          />
          <Input
            label="Actor (user ID)"
            type="search"
            placeholder="Filtrar por actor…"
            value={actorQuery}
            onChange={(e) => setActorQuery(e.target.value)}
            className="max-w-xs"
          />
          <button
            type="button"
            onClick={handleApplyFilters}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Aplicar filtros
          </button>
        </div>

        {/* Status */}
        {isLoading && <p className="mt-4 text-sm text-gray-500">Cargando auditoría…</p>}
        {isError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            Error al cargar: {error instanceof Error ? error.message : "desconocido"}
          </p>
        )}

        {/* Table */}
        {!isLoading && !isError && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-semibold">Fecha</th>
                    <th className="px-3 py-2 font-semibold">Actor</th>
                    <th className="px-3 py-2 font-semibold">Acción</th>
                    <th className="px-3 py-2 font-semibold">Objeto</th>
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        Sin entradas de auditoría.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0">
                        <td
                          className="whitespace-nowrap px-3 py-2 align-top text-gray-600"
                          title={formatTimestamp(entry.createdAt)}
                        >
                          {relativeTime(entry.createdAt)}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          {entry.actorUserId ?? <span className="text-gray-400">sistema</span>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className="inline-block rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-gray-600">
                          {entry.targetType ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          {entry.targetId ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <MetadataCell metadata={entry.metadata} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {hasNextPage && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {isFetchingNextPage ? "Cargando…" : "Cargar más"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </RequireCapability>
  );
}
