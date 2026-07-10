"use client";

/**
 * Vista de búsqueda de pacientes. JSX/Tailwind verbatim del original. El input
 * se controla aquí y el contenedor padre debounce + dispara usePatientSearch.
 * El overlay de detalle se carga con next/dynamic (modal pesado, no above-fold).
 */
import { memo, useState } from "react";
import dynamic from "next/dynamic";
import {
  PATIENT_CONDITION_META,
  PATIENT_STATUS_META,
} from "@/lib/hospitals-meta";
import type { PatientSearchResult } from "@/hooks/hospitals";
import SearchInput from "@/components/ui/SearchInput";

const PatientDetailOverlay = dynamic(() => import("./PatientDetailOverlay"), {
  ssr: false,
});

export interface PatientSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  results: PatientSearchResult[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
}

export default function PatientSearch({
  query,
  onQueryChange,
  results,
  hasMore,
  loading,
  error,
  onLoadMore,
}: PatientSearchProps) {
  const [selected, setSelected] = useState<PatientSearchResult | null>(null);
  const trimmed = query.trim();
  const empty = trimmed.length === 0;
  const tooShort = trimmed.length === 1;

  return (
    <div className="mt-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label
          htmlFor="patient-search"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Buscar paciente por nombre o cédula
        </label>
        <SearchInput
          id="patient-search"
          value={query}
          onValueChange={onQueryChange}
          aria-label="Buscar paciente por nombre o cédula"
          placeholder="Ej. Antonella, Yose Palma, 5.199.693…"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-red-400"
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Busca en todos los hospitales. Para cédulas puedes escribir con o sin
          puntos.
        </p>
      </div>

      <div className="mt-4">
        {tooShort ? (
          <p className="text-center text-xs text-slate-500">
            Escribe al menos 2 caracteres.
          </p>
        ) : error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : loading && results.length === 0 ? (
          <p className="text-center text-sm text-slate-500">Buscando…</p>
        ) : results.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              {empty
                ? "Todavía no hay pacientes registrados."
                : `No se encontró ningún paciente con “${trimmed}”.`}
            </p>
            {!empty && (
              <p className="mt-1 text-xs text-slate-500">
                Verifica el nombre o intenta con la cédula.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500">
              {empty
                ? `Últimos ${results.length} pacientes registrados`
                : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
            </p>
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.patient.id}>
                  <PatientResultCard result={r} onOpen={setSelected} />
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Cargando…" : "Mostrar 20 más"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <PatientDetailOverlay
          result={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

interface PatientResultCardProps {
  result: PatientSearchResult;
  onOpen: (result: PatientSearchResult) => void;
}

const PatientResultCard = memo(function PatientResultCard({
  result,
  onOpen,
}: PatientResultCardProps) {
  const { patient, hospital } = result;
  const condition = PATIENT_CONDITION_META[patient.condition];
  const status = PATIENT_STATUS_META[patient.status];

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {patient.name}
            {patient.age !== null && (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {patient.age} años
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ background: status.color }}
            >
              {status.label}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ background: condition.color }}
            >
              {condition.label}
            </span>
          </div>
        </div>
        <span className="text-xs font-semibold text-red-600">Ver detalles</span>
      </div>
      <p className="mt-2 truncate text-xs text-slate-600">
        🏥 <span className="font-medium text-slate-800">{hospital.name}</span>
        {hospital.state && (
          <span className="text-slate-500"> · {hospital.state}</span>
        )}
      </p>
      {patient.notes && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{patient.notes}</p>
      )}
    </button>
  );
});
