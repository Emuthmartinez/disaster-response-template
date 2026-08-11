"use client";

/**
 * Pantalla de insumos hospitalarios: board de todos los hospitales (semáforos,
 * necesidades activas y solicitudes de ayuda abiertas) + detalle editable del
 * hospital seleccionado. Los datos vienen del snapshot RESTRINGIDO (incluye
 * notas y contactos internos), gateado por hospital:read / hospital:edit.
 */
import { useMemo, useState } from "react";
import { MetricCard } from "@/src/ui";
import { useSupplyBoard } from "./use-hospital-supplies";
import { SupplyDetail } from "./supply-detail";
import { STATUS_DOT, type SupplyBoardRow } from "./types";

export function HospitalSuppliesAdmin() {
  const board = useSupplyBoard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = board.data?.hospitals ?? [];
    const query = filter.trim().toLowerCase();
    const matches = query
      ? all.filter(
          (row) =>
            row.hospital.name.toLowerCase().includes(query) ||
            row.hospital.state.toLowerCase().includes(query) ||
            row.hospital.municipality.toLowerCase().includes(query),
        )
      : all;
    // Peor primero: rojos, luego amarillos, luego el resto; a igualdad, más
    // necesidades activas primero.
    const rank = { red: 0, yellow: 1, unknown: 2, green: 3 } as const;
    return [...matches].sort(
      (a, b) =>
        rank[a.supply.summary.worstStatus] - rank[b.supply.summary.worstStatus] ||
        b.supply.summary.counts.activeNeeds - a.supply.summary.counts.activeNeeds,
    );
  }, [board.data, filter]);

  const selected = rows.find((row) => row.hospital.id === selectedId) ?? null;
  const stats = board.data?.stats;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Insumos hospitalarios</h1>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <MetricCard label="Hospitales" value={stats.hospitals} />
          <MetricCard label="Categorías en rojo" value={stats.redCategories} accent="#dc2626" />
          <MetricCard label="En amarillo" value={stats.yellowCategories} accent="#ca8a04" />
          <MetricCard label="Desactualizadas" value={stats.staleCategories} />
          <MetricCard label="Necesidades activas" value={stats.activeNeeds} />
          <MetricCard label="Ayudas abiertas" value={stats.helpOpen} accent="#dc2626" />
        </div>
      )}

      {board.isLoading && <p className="text-sm text-gray-500">Cargando insumos…</p>}
      {board.error && (
        <p role="alert" className="text-sm text-red-600">
          {board.error.message}
        </p>
      )}

      {board.data && (
        <div className="flex flex-col gap-6 lg:flex-row">
          <section className="lg:w-1/2">
            <input
              type="search"
              placeholder="Filtrar por nombre, estado o municipio…"
              className="mb-2 w-full rounded border px-3 py-2 text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filtrar hospitales"
            />
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Hospital</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Semáforo</th>
                    <th className="px-3 py-2">Rojas</th>
                    <th className="px-3 py-2">Necesidades</th>
                    <th className="px-3 py-2">Ayudas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <BoardRow
                      key={row.hospital.id}
                      row={row}
                      selected={row.hospital.id === selectedId}
                      onSelect={() => setSelectedId(row.hospital.id)}
                    />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-gray-500">
                        Sin hospitales que coincidan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="lg:w-1/2">
            {selected ? (
              <SupplyDetail key={selected.hospital.id} row={selected} />
            ) : (
              <p className="rounded border border-dashed p-6 text-sm text-gray-500">
                Selecciona un hospital para ver y editar sus insumos.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function BoardRow({
  row,
  selected,
  onSelect,
}: {
  row: SupplyBoardRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const { hospital, supply } = row;
  const openHelp = supply.helpRequests.filter(
    (request) => request.status === "open" || request.status === "contacting",
  ).length;
  return (
    <tr
      className={["cursor-pointer border-t", selected ? "bg-gray-900 text-white" : "hover:bg-gray-50"].join(" ")}
      onClick={onSelect}
    >
      <td className="px-3 py-2 font-medium">{hospital.name}</td>
      <td className="px-3 py-2">{hospital.state}</td>
      <td className="px-3 py-2">
        <span
          className={["inline-block h-3 w-3 rounded-full", STATUS_DOT[supply.summary.worstStatus]].join(" ")}
          title={supply.summary.worstStatus}
        />
      </td>
      <td className="px-3 py-2">{supply.summary.counts.red}</td>
      <td className="px-3 py-2">{supply.summary.counts.activeNeeds}</td>
      <td className="px-3 py-2">{openHelp}</td>
    </tr>
  );
}
