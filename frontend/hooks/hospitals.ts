"use client";

/**
 * Hooks de datos del dominio "hospitals" (TanStack Query). Espeja el patrón
 * canónico de hooks/missing.ts:
 *  - useHospitals: carga única de TODA la red hospitalaria (limit=1000 +
 *    include=states). No se pollea: el directorio es estable durante la sesión,
 *    así que usamos staleTime largo. queryFn usa apiGet (ETag/304).
 *  - usePatientSearch: búsqueda global de pacientes. El componente debounce el
 *    término antes de llamar; el hook NO se dispara con 1 carácter (enabled).
 *    queryKey por término+limit → dedup y cache por búsqueda.
 *  - useHospitalPatients: pacientes de un hospital (detalle), misma forma.
 *  - contrato JSON idéntico al backend.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type {
  Hospital,
  HospitalPatient,
  PublicHospitalSupplySummary,
} from "@/lib/hospitals-meta";

const HOSPITAL_DETAIL_POLL_MS = 30_000;

export interface HospitalPatientsOptions {
  initial?: HospitalPatientsResponse;
  pollMs?: number;
}

export interface HospitalSuppliesResponse {
  supply: PublicHospitalSupplySummary | null;
}

export interface HospitalSuppliesOptions {
  initial?: PublicHospitalSupplySummary | null;
  pollMs?: number;
}

// ---- Directorio (carga única) ----
export interface HospitalsResponse {
  hospitals?: Hospital[];
  states?: string[];
}

export interface HospitalsData {
  hospitals: Hospital[];
  states: string[];
}

const HOSPITALS_STALE_MS = 5 * 60_000;

/** Lista completa de hospitales + estados. Carga una vez (staleTime largo). */
export function useHospitals() {
  return useQuery({
    queryKey: qk.hospitals.list({ include: "states", limit: 1000 }),
    queryFn: ({ signal }) =>
      apiGet<HospitalsResponse>(
        "/api/hospitals?include=states&limit=1000",
        signal,
      ),
    staleTime: HOSPITALS_STALE_MS,
    select: (data): HospitalsData => ({
      hospitals: data.hospitals ?? [],
      states: Array.isArray(data.states) ? data.states : [],
    }),
  });
}

// ---- Búsqueda de pacientes (debounced en el componente) ----
export interface PatientSearchResult {
  patient: HospitalPatient;
  hospital: {
    id: string;
    name: string;
    state: string;
    municipality: string;
    address: string;
  };
}

export interface PatientSearchResponse {
  results?: PatientSearchResult[];
  hasMore?: boolean;
}

/** Mínimo de caracteres para buscar (1 char no dispara request; espeja el viejo). */
export const MIN_PATIENT_SEARCH_LEN = 2;

/**
 * Búsqueda de pacientes. `q` ya viene debounced del componente. El query se
 * habilita solo si q está vacío (últimos registrados) o tiene >= 2 caracteres;
 * con exactamente 1 char queda deshabilitado (igual que el comportamiento viejo).
 */
export function usePatientSearch(q: string, limit: number) {
  const trimmed = q.trim();
  const enabled =
    trimmed.length === 0 || trimmed.length >= MIN_PATIENT_SEARCH_LEN;
  return useQuery({
    queryKey: qk.hospitals.patientSearch(`${trimmed}:${limit}`),
    queryFn: ({ signal }) =>
      apiGet<PatientSearchResponse>(
        `/api/patients/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
        signal,
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}

// ---- Pacientes de un hospital (detalle) ----
export interface HospitalPatientsResponse {
  hospital?: Hospital;
  patients?: HospitalPatient[];
}

/** Pacientes + datos frescos de un hospital (overlay o página de detalle). */
export function useHospitalPatients(
  hospitalId: string,
  opts?: HospitalPatientsOptions,
) {
  return useQuery({
    queryKey: qk.hospitals.patients(hospitalId),
    queryFn: ({ signal }) =>
      apiGet<HospitalPatientsResponse>(
        `/api/hospitals/${hospitalId}/patients`,
        signal,
      ),
    initialData: opts?.initial,
    staleTime: HOSPITAL_DETAIL_POLL_MS,
    refetchInterval: opts?.pollMs,
  });
}

/** Insumos hospitalarios públicos (página de detalle). */
export function useHospitalSupplies(
  hospitalId: string,
  opts?: HospitalSuppliesOptions,
) {
  return useQuery({
    queryKey: qk.hospitals.supplies(hospitalId),
    queryFn: ({ signal }) =>
      apiGet<HospitalSuppliesResponse>(
        `/api/hospitals/${hospitalId}/supplies`,
        signal,
      ),
    initialData:
      opts?.initial !== undefined ? { supply: opts.initial } : undefined,
    staleTime: HOSPITAL_DETAIL_POLL_MS,
    refetchInterval: opts?.pollMs,
  });
}
