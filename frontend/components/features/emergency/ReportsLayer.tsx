"use client";

import type { EmergencyReport, ReportType } from "@/lib/types";
import type { MissingStats } from "@/lib/missing";
import SearchInput from "@/components/ui/SearchInput";
import ReportCard from "./ReportCard";
import { AdminToggle } from "./AdminPanel";
import { SearchX } from "lucide-react";

export interface ReportsLayerProps {
  reports: EmergencyReport[];
  visibleReports: EmergencyReport[];
  shownReports: EmergencyReport[];
  remainingReports: number;
  selectedTypes: Set<ReportType>;
  allTypesSelected: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  now: number;
  confirmed: Set<string>;
  isAdmin: boolean;
  missingStats: MissingStats | null;
  onLoadMore: () => void;
  onFocusReport: (report: EmergencyReport) => void;
  onConfirm: (id: string) => void;
  onResolve: (id: string) => void;
  onLogout: () => void;
}

export default function ReportsLayer({
  reports,
  visibleReports,
  shownReports,
  remainingReports,
  selectedTypes,
  allTypesSelected,
  query,
  onQueryChange,
  now,
  confirmed,
  isAdmin,
  missingStats,
  onLoadMore,
  onFocusReport,
  onConfirm,
  onResolve,
  onLogout,
}: ReportsLayerProps) {
  return (
    <div className="e-map-sidebar">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--eborder)] px-3 py-3">
        <div aria-live="polite">
          <p className="text-sm font-semibold text-[var(--etext)]">
            Desaparecidas activas:{" "}
            {missingStats ? (
              <span className="font-bold text-red-600 tabular-nums">
                {missingStats.active.toLocaleString("es")}
              </span>
            ) : (
              <span className="text-[var(--etext2)]">cargando…</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--etext2)] tabular-nums">
            Reportes en mapa: {reports.length.toLocaleString("es")}
            {missingStats
              ? ` · ${missingStats.onMap.toLocaleString("es")} con punto`
              : ""}
          </p>
          <p className="text-[11px] text-[var(--etext2)]">
            Toca un tipo en el mapa para filtrar la lista
          </p>
        </div>
        <AdminToggle isAdmin={isAdmin} onLogout={onLogout} />
      </div>

      <div className="mt-3 flex flex-col gap-2 px-3">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Buscar por nombre, sector, zona o necesidad…"
          ariaLabel="Buscar reportes"
        />
      </div>

      <div className="mx-3 mb-3 mt-3 max-h-[70vh] min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--eborder)] bg-[var(--einput)] p-2 md:max-h-none">
        {selectedTypes.has("missing") &&
          missingStats &&
          missingStats.active > 0 && (
            <div
              className="mb-2 rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--qi-info)",
                background: "var(--qi-info-surface)",
                color: "var(--qi-azul-score)",
              }}
            >
              Hay{" "}
              <strong>{missingStats.active.toLocaleString("es")}</strong>{" "}
              personas desaparecidas en la base consolidada. En el mapa se
              muestran las que tienen ubicación geocodificada (
              {missingStats.onMap.toLocaleString("es")}).{" "}
              <a href="#e-directory" className="font-semibold underline">
                Ver lista completa →
              </a>
            </div>
          )}
        {visibleReports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-sm text-[var(--etext3)]">
            <SearchX size={20} aria-hidden="true" />
            <p>
              {query.trim()
                ? `No se encontraron reportes para “${query.trim()}”.`
                : selectedTypes.size === 0
                  ? "Selecciona un tipo en el mapa para ver reportes."
                  : `Aún no hay reportes${allTypesSelected ? "" : " de los tipos seleccionados"}. Usa el botón "+ Reportar" para crear el primero.`}
            </p>
          </div>
        ) : (
          <>
            {(query.trim() || !allTypesSelected) && (
              <p
                aria-live="polite"
                className="px-3 py-2 text-xs font-medium text-[var(--etext3)]"
              >
                {visibleReports.length} resultado(s)
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {shownReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  now={now}
                  confirmed={confirmed.has(report.id)}
                  isAdmin={isAdmin}
                  onFocus={onFocusReport}
                  onConfirm={onConfirm}
                  onResolve={onResolve}
                />
              ))}
            </ul>
            {remainingReports > 0 && (
              <button
                type="button"
                onClick={onLoadMore}
                className="mt-2 w-full rounded-xl border border-[var(--eborder)] bg-[var(--einput)] px-3 py-2.5 text-sm font-semibold text-[var(--etext)] transition hover:bg-[var(--esurf)]"
              >
                Ver más ({remainingReports.toLocaleString("es")} restantes)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
