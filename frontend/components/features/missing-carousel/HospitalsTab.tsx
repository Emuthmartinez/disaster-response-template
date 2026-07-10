"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  type Hospital,
  type HospitalPriorityZone,
} from "@/lib/hospitals-meta";
import { deploymentConfig } from "@/lib/deployment-config";
import {
  filterHospitals,
  HospitalCard,
  HospitalStatsRow,
  HospitalZoneFilters,
} from "@/components/features/hospitals/HospitalDirectoryUI";
import { trackHospitalDetailViewed } from "@/lib/analytics";
import { useHospitals } from "@/hooks/hospitals";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { useHospitalGridColumns } from "./useHospitalGridColumns";

// Overlay de detalle pesado: code-split, solo carga al tocar un hospital.
const HospitalDetailOverlay = dynamic(
  () => import("@/components/features/hospitals/HospitalDetailOverlay"),
  { ssr: false },
);

const HOSPITAL_PREVIEW_ROWS = 4;

/**
 * Pestaña de hospitales del directorio. DATOS vía useHospitals (TanStack,
 * cacheado por ETag, dedup compartido). El filtrado/paginación es en cliente
 * sobre la lista cacheada (igual que el original). UI verbatim.
 */
export function HospitalsTab() {
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<HospitalPriorityZone | "all">(
    "all",
  );
  const [page, setPage] = useState(1);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(
    null,
  );
  const gridCols = useHospitalGridColumns();

  const { data, isLoading } = useHospitals();
  // useMemo: sin esto, `data?.hospitals ?? []` crea un array nuevo en cada
  // render cuando data es undefined, recalculando el useMemo de `visible`.
  const hospitals = useMemo(() => data?.hospitals ?? [], [data?.hospitals]);
  const loading = isLoading;

  const visible = useMemo(
    () => filterHospitals(hospitals, search, zoneFilter),
    [hospitals, search, zoneFilter],
  );

  const pageSize = gridCols * HOSPITAL_PREVIEW_ROWS;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paginatedHospitals = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setPage(1));
    return () => cancelAnimationFrame(id);
  }, [search, zoneFilter]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPage((p) => Math.min(p, totalPages)));
    return () => cancelAnimationFrame(id);
  }, [totalPages]);

  return (
    <>
      <div>
        <h2 className="qi-h2">Hospitales y centros de salud</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--etext2)]">
          Lista priorizada de la red hospitalaria de {deploymentConfig.regionLabel} según
          la zona de afectación. Toca un hospital para ver los pacientes registrados.
        </p>
      </div>

      {!loading && hospitals.length > 0 && (
        <HospitalStatsRow hospitals={hospitals} />
      )}

      <div className="e-hospital-toolbar">
        <SearchInput
          id="hospitales-directory-search"
          label="Buscar hospitales"
          value={search}
          onChange={setSearch}
          placeholder="🔍 Buscar por nombre, municipio o dirección…"
          className="e-input w-full lg:max-w-md"
        />
        <HospitalZoneFilters
          zoneFilter={zoneFilter}
          onZoneFilterChange={setZoneFilter}
        />
      </div>

      <div className="e-hospital-grid" role="list">
        {loading ? (
          <div
            className="e-card col-span-full flex items-center justify-center border-dashed p-8 text-sm text-[var(--etext2)]"
            role="listitem"
          >
            Cargando hospitales…
          </div>
        ) : visible.length === 0 ? (
          <div
            className="e-card col-span-full flex flex-col items-center justify-center gap-1 border-dashed p-8 text-center text-[var(--etext2)]"
            role="listitem"
          >
            <span className="text-2xl">🏥</span>
            <p className="text-sm font-medium">
              {hospitals.length === 0
                ? "Aún no hay hospitales"
                : "No se encontraron hospitales"}
            </p>
            <p className="text-xs">
              {hospitals.length === 0
                ? "La lista se actualizará cuando se registren centros de salud."
                : "Prueba con otro nombre, municipio o filtro de zona."}
            </p>
          </div>
        ) : (
          paginatedHospitals.map((hospital) => (
            <HospitalCard
              key={hospital.id}
              hospital={hospital}
              onOpen={() => {
                trackHospitalDetailViewed({
                  priorityZone: hospital.priorityZone,
                  patientCount: hospital.activePatients,
                  source: "hospital_card_overlay",
                });
                setSelectedHospital(hospital);
              }}
            />
          ))
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        ariaLabel="Paginación del directorio de hospitales"
      />
      {totalPages > 1 && (
        <p className="mt-2 text-center text-[11px] text-[var(--etext3)]">
          Página {page.toLocaleString("es")} de{" "}
          {totalPages.toLocaleString("es")} ·{" "}
          {visible.length.toLocaleString("es")} hospitales
        </p>
      )}

      {selectedHospital && (
        <HospitalDetailOverlay
          hospital={selectedHospital}
          onClose={() => setSelectedHospital(null)}
        />
      )}
    </>
  );
}
