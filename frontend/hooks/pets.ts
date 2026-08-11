"use client";

/**
 * ============================================================================
 * HOOKS DE DATOS del dominio "pets" — mismo patrón canónico que hooks/missing.ts.
 * ============================================================================
 *
 * Reglas del patrón (idénticas a personas):
 *  - queries: useQuery con queryKey de qk.pets.* (NUNCA array inline → dedup).
 *  - mutaciones: useMutation + invalidateQueries(qk.pets.all) en onSuccess.
 *    OJO: se invalida `qk.pets.all`, no `qk.missing.all` — reportar una mascota
 *    no debe forzar un refetch del directorio de personas.
 *  - tipos del lado cliente espejan el DTO del backend (mismo contrato JSON).
 *  - NADA de fetch/setInterval a mano en los componentes: solo estos hooks.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  buildPetsUrl,
  buildPetsMapUrl,
  type MapBoundsLike,
  type Pet,
  type PetListParams,
  type PetListResponse,
  type PetMapMarker,
  type PetStats,
} from "@/lib/pets";

// Los tipos y helpers puros viven en lib/pets.ts (sin "use client") para que el
// prefetch SSR construya la MISMA URL y la MISMA queryKey. Se re-exportan aquí
// para los consumidores que importan desde "@/hooks/pets".
export {
  PET_DEFAULT_LIST_PARAMS,
  PET_LIST_PAGE_SIZE,
  PET_SEX_OPTIONS,
  PET_SPECIES_OPTIONS,
  MIN_SEARCH_LEN,
  buildPetsUrl,
  petDisplayName,
} from "@/lib/pets";
export type {
  Pet,
  PetListParams,
  PetListResponse,
  PetMapMarker,
  PetSex,
  PetStats,
} from "@/lib/pets";

/** queryFn compartido por la query y el prefetch (misma forma → misma entrada
 *  de caché). */
const fetchPetsPage =
  (params: PetListParams) =>
  ({ signal }: { signal?: AbortSignal }) =>
    apiGet<PetListResponse>(buildPetsUrl(params), signal);

// Una página se considera fresca 30s: paginar adelante/atrás NO la re-pide por
// red. Mismo valor que el directorio de personas.
const PETS_LIST_STALE_MS = 30_000;

/** Lista paginada de mascotas (polleada). */
export function usePetsList(params: PetListParams, pollMs = 8000) {
  return useQuery({
    queryKey: qk.pets.list(params),
    queryFn: fetchPetsPage(params),
    refetchInterval: pollMs,
    staleTime: PETS_LIST_STALE_MS,
    // keepPreviousData-like: no parpadear al cambiar de página.
    placeholderData: (prev) => prev,
  });
}

/** Prefetch de páginas vecinas para que paginar sea instantáneo. */
export function usePrefetchPetsPages() {
  const qc = useQueryClient();
  return (params: PetListParams, totalPages: number) => {
    for (const page of [params.page + 1, params.page - 1]) {
      if (page < 1 || page > totalPages) continue;
      const p = { ...params, page };
      qc.prefetchQuery({
        queryKey: qk.pets.list(p),
        queryFn: fetchPetsPage(p),
        staleTime: PETS_LIST_STALE_MS,
      });
    }
  };
}

/** Conteos del directorio de mascotas. */
export function usePetStats(pollMs = 60_000) {
  return useQuery({
    queryKey: qk.pets.stats,
    queryFn: ({ signal }) =>
      apiGet<{ stats: PetStats }>("/api/pets/stats", signal).then((r) => r.stats),
    refetchInterval: pollMs,
  });
}

// ---- Mutaciones ----
export interface CreatePetInput {
  name?: string;
  species?: string;
  breed?: string;
  color?: string;
  sex?: string | null;
  age?: number | string | null;
  description?: string;
  lastSeen?: string;
  contact?: string;
  microchip?: string | null;
  photo?: string | null;
  reportType?: "missing" | "found";
  /** Coordenadas de la zona (geocodificadas en el submit). null = sin pin. */
  lat?: number | null;
  lng?: number | null;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

/** Marcadores de mascotas para el mapa, acotados al viewport (bounds).
 *  El caller DEBE pasar bounds ya debounced (~350ms) para no pedir por cada pan. */
export function usePetsMap(bounds: MapBoundsLike | null) {
  return useQuery({
    queryKey: qk.pets.map(bounds),
    queryFn: ({ signal }) =>
      apiGet<{ markers: PetMapMarker[] }>(buildPetsMapUrl(bounds), signal).then(
        (r) => r.markers ?? [],
      ),
    placeholderData: (prev) => prev,
  });
}

export function useCreatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePetInput) =>
      apiSend<{ pet: Pet }>("POST", "/api/pets", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pets.all }),
  });
}

export function useDeletePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>("DELETE", `/api/pets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pets.all }),
  });
}

export function useMarkPetFound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      note: string;
      photo: string | null;
      turnstileToken?: string;
    }) =>
      apiSend<{ pet: Pet }>("POST", `/api/pets/${args.id}/found`, {
        note: args.note,
        photo: args.photo,
        turnstileToken: args.turnstileToken,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pets.all }),
  });
}
