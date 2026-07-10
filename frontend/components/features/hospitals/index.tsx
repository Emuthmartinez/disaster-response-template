"use client";

/**
 * Contenedor de la feature "hospitales". Orquesta hooks (useHospitals +
 * usePatientSearch) y subcomponentes presentacionales. JSX/Tailwind verbatim
 * del componente original; solo cambia el cableado de datos a TanStack Query.
 *
 * Patrón canónico (ver hooks/missing.ts + MissingPersons):
 *  - los DATOS viven en los hooks; aquí solo: estado de UI (tab, filtros,
 *    debounce, paginación local) + derivaciones memoizadas + analítica.
 *  - cero fetch/setState-para-datos a mano.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRIORITY_ZONE_META,
  type HospitalPriorityZone,
} from "@/lib/hospitals-meta";
import { deploymentConfig } from "@/lib/deployment-config";
import {
  HospitalStatCard,
  computeHospitalStats,
  filterHospitals,
} from "@/components/features/hospitals/HospitalDirectoryUI";
import {
  trackHospitalListViewed,
  trackHospitalPatientSearchResultsLoaded,
  trackHospitalPatientSearchStarted,
} from "@/lib/analytics";
import {
  useHospitals,
  usePatientSearch,
  type PatientSearchResult,
} from "@/hooks/hospitals";
import HospitalsListView from "./HospitalsListView";
import PatientSearch from "./PatientSearch";
import { TabButton } from "./atoms";

type Tab = "hospitals" | "patients";
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export default function Hospitals() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [zoneFilter, setZoneFilter] = useState<HospitalPriorityZone | "all">("all");
  const [tab, setTab] = useState<Tab>("hospitals");
  const [patientQuery, setPatientQuery] = useState("");
  const [debouncedPatientQuery, setDebouncedPatientQuery] = useState("");
  const [patientLimit, setPatientLimit] = useState(PAGE_SIZE);
  const lastTrackedPatientSearchRef = useRef("");
  const lastTrackedPatientResultsRef = useRef("");

  // ---- Datos (TanStack Query) ----
  const {
    data: hospitalsData,
    isLoading: loading,
    error: hospitalsError,
  } = useHospitals();
  const hospitals = useMemo(() => hospitalsData?.hospitals ?? [], [hospitalsData]);
  const states = hospitalsData?.states ?? [];
  const error = hospitalsError
    ? hospitalsError instanceof Error
      ? hospitalsError.message
      : "No se pudo cargar la lista de hospitales."
    : null;

  const {
    data: patientData,
    isFetching: patientFetching,
    error: patientQueryError,
  } = usePatientSearch(debouncedPatientQuery, patientLimit);
  const patientResults = useMemo(
    () => patientData?.results ?? [],
    [patientData],
  );
  const patientHasMore = Boolean(patientData?.hasMore);
  const patientError = patientQueryError
    ? "No se pudo realizar la búsqueda."
    : null;

  // Analítica: vista de lista al montar.
  useEffect(() => {
    trackHospitalListViewed("hospitales_page");
  }, []);

  // Debounce de la búsqueda de pacientes (~350ms).
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedPatientQuery(patientQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [patientQuery]);

  // Analítica: búsqueda de paciente iniciada (al cambiar el término debounced).
  useEffect(() => {
    const q = debouncedPatientQuery.trim();
    if (q.length === 1) return;
    if (q && lastTrackedPatientSearchRef.current !== q) {
      lastTrackedPatientSearchRef.current = q;
      trackHospitalPatientSearchStarted(true);
    }
  }, [debouncedPatientQuery]);

  // Analítica: resultados de búsqueda cargados.
  useEffect(() => {
    const q = debouncedPatientQuery.trim();
    if (!q || patientFetching) return;
    const resultsKey = `${q}:${patientResults.length}:${patientLimit}`;
    if (lastTrackedPatientResultsRef.current === resultsKey) return;
    lastTrackedPatientResultsRef.current = resultsKey;
    trackHospitalPatientSearchResultsLoaded(patientResults.length);
  }, [debouncedPatientQuery, patientFetching, patientResults, patientLimit]);

  const visible = useMemo(
    () =>
      filterHospitals(hospitals, search, zoneFilter).filter((h) => {
        if (!stateFilter) return true;
        return h.state === stateFilter;
      }),
    [hospitals, search, stateFilter, zoneFilter],
  );

  const stats = useMemo(() => computeHospitalStats(hospitals), [hospitals]);

  return (
    <section
      id="hospitales"
      className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 py-10"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
            🏥 Hospitales
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Hospitales y centros de salud
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Lista priorizada de la red hospitalaria de {deploymentConfig.regionLabel} según
            la zona de afectación. Toca un hospital para ver los pacientes registrados.
          </p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <HospitalStatCard label="Total" value={stats.total} accent="#0f172a" />
        {(Object.keys(PRIORITY_ZONE_META) as HospitalPriorityZone[]).map((zone) => (
          <HospitalStatCard
            key={zone}
            label={`${PRIORITY_ZONE_META[zone].emoji} ${PRIORITY_ZONE_META[zone].label}`}
            value={stats.byZone[zone]}
            accent={PRIORITY_ZONE_META[zone].color}
          />
        ))}
        <HospitalStatCard
          label="Hospitalizados"
          value={stats.activePatients}
          accent="#1d4ed8"
        />
      </div>

      <div
        role="tablist"
        aria-label="Vistas de hospitales"
        className="mt-5 inline-flex rounded-full border border-slate-200 bg-slate-100 p-1"
      >
        <TabButton active={tab === "hospitals"} onClick={() => setTab("hospitals")}>
          🏥 Hospitales
        </TabButton>
        <TabButton
          active={tab === "patients"}
          onClick={() => {
            trackHospitalPatientSearchStarted(false);
            setTab("patients");
          }}
        >
          🔎 Buscar paciente
        </TabButton>
      </div>

      {tab === "patients" ? (
        <PatientSearch
          query={patientQuery}
          onQueryChange={(value) => {
            setPatientQuery(value);
            setPatientLimit(PAGE_SIZE);
          }}
          results={patientResults}
          hasMore={patientHasMore}
          loading={patientFetching}
          error={patientError}
          onLoadMore={() => setPatientLimit((limit) => limit + PAGE_SIZE)}
        />
      ) : (
        <HospitalsListView
          search={search}
          setSearch={setSearch}
          stateFilter={stateFilter}
          setStateFilter={setStateFilter}
          zoneFilter={zoneFilter}
          setZoneFilter={setZoneFilter}
          states={states}
          loading={loading}
          error={error}
          visible={visible}
        />
      )}
    </section>
  );
}

export type { PatientSearchResult };
