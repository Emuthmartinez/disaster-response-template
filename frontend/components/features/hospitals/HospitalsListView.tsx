"use client";

/**
 * Directorio de hospitales (tab "hospitales"). JSX/Tailwind verbatim. Las
 * tarjetas se memoizan (HospitalCard) y el overlay de detalle se carga con
 * next/dynamic (modal pesado, no above-fold).
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  PRIORITY_ZONE_META,
  type Hospital,
  type HospitalPriorityZone,
} from "@/lib/hospitals-meta";
import { HOSPITAL_ZONE_FILTERS } from "@/components/features/hospitals/HospitalDirectoryUI";
import { trackHospitalFilterUsed } from "@/lib/analytics";
import SearchInput from "@/components/ui/SearchInput";
import HospitalCard from "./HospitalCard";

const HospitalDetailOverlay = dynamic(() => import("./HospitalDetailOverlay"), {
  ssr: false,
});

const ZONE_FILTERS = HOSPITAL_ZONE_FILTERS;

export interface HospitalsListViewProps {
  search: string;
  setSearch: (v: string) => void;
  stateFilter: string;
  setStateFilter: (v: string) => void;
  zoneFilter: HospitalPriorityZone | "all";
  setZoneFilter: (v: HospitalPriorityZone | "all") => void;
  states: string[];
  loading: boolean;
  error: string | null;
  visible: Hospital[];
}

export default function HospitalsListView({
  search,
  setSearch,
  stateFilter,
  setStateFilter,
  zoneFilter,
  setZoneFilter,
  states,
  loading,
  error,
  visible,
}: HospitalsListViewProps) {
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);

  return (
    <>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            if (value.trim().length === 2) {
              trackHospitalFilterUsed("search");
            }
          }}
          aria-label="Buscar hospitales por nombre, municipio o dirección"
          placeholder="Buscar por nombre, municipio o dirección…"
          className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 lg:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              trackHospitalFilterUsed("state");
            }}
            aria-label="Filtrar por estado"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
          >
            <option value="">Todos los estados</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {ZONE_FILTERS.map((f) => {
              const active = zoneFilter === f.value;
              const color =
                f.value !== "all" ? PRIORITY_ZONE_META[f.value].color : "#0f172a";
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    setZoneFilter(f.value);
                    trackHospitalFilterUsed("zone", f.value);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  style={active ? { background: color } : undefined}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            Cargando hospitales…
          </p>
        ) : error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            No se encontraron hospitales con esos filtros.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((h) => (
              <li key={h.id}>
                <HospitalCard hospital={h} onOpen={setSelectedHospital} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedHospital && (
        <HospitalDetailOverlay
          hospital={selectedHospital}
          onClose={() => setSelectedHospital(null)}
        />
      )}
    </>
  );
}
