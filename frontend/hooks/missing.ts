"use client";

/**
 * ============================================================================
 * HOOKS DE DATOS DE REFERENCIA (dominio "missing") — patrón canónico TanStack.
 * El workflow replica EXACTAMENTE esta forma para los demás dominios.
 * ============================================================================
 *
 * Reglas del patrón:
 *  - queries: useQuery con queryKey de qk.* (NUNCA array inline → dedup correcto).
 *    Lecturas polleadas: refetchInterval (pausado en background por el client).
 *    queryFn usa apiGet (ETag/304). select para derivar/normalizar si hace falta.
 *  - mutaciones: useMutation + invalidateQueries(qk.<dominio>.all) en onSuccess.
 *  - tipos del lado cliente espejan el DTO del backend (mismo contrato JSON).
 *  - NADA de fetch/setInterval/setState a mano en los componentes: solo estos hooks.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export interface MissingPerson {
  id: string;
  name: string;
  age: number | null;
  nationality?: string;
  description: string;
  lastSeen: string;
  contact: string;
  photoUrl: string | null;
  status?: "active" | "found";
  resolutionNote?: string | null;
  resolutionPhotoUrl?: string | null;
  resolvedAt?: number | null;
  createdAt: number;
}

/** Marcador ligero para el mapa (subset de MissingPerson + lat/lng). */
export interface MissingMapMarker {
  id: string;
  name: string;
  age: number | null;
  nationality: string;
  lastSeen: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface MissingListResponse {
  people: MissingPerson[];
  total: number;
  totalCapped: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  persistent: boolean;
}

export interface MissingListParams {
  status: "active" | "found" | "all";
  page: number;
  pageSize: number;
  q?: string;
}

function buildMissingUrl(p: MissingListParams): string {
  const sp = new URLSearchParams({
    status: p.status,
    page: String(p.page),
    pageSize: String(p.pageSize),
  });
  if (p.q && p.q.length >= 3) sp.set("q", p.q);
  return `/api/missing?${sp.toString()}`;
}

/** queryFn compartido por la query y el prefetch (misma forma → misma entrada
 *  de caché). */
const fetchMissingPage =
  (params: MissingListParams) =>
  ({ signal }: { signal?: AbortSignal }) =>
    apiGet<MissingListResponse>(buildMissingUrl(params), signal);

// Una página se considera fresca 30s: paginar adelante/atrás NO la re-pide por
// red (se sirve de caché al instante); el refetchInterval mantiene la vista viva
// igual. Sin esto (staleTime global 5s) volver a una página tras 5s la refrescaba.
const MISSING_LIST_STALE_MS = 30_000;

/** Lista paginada de personas (polleada). Dedup: dos componentes con los MISMOS
 *  params comparten un solo request (mismo queryKey). */
export function useMissingList(params: MissingListParams, pollMs = 8000) {
  return useQuery({
    queryKey: qk.missing.list(params),
    queryFn: fetchMissingPage(params),
    refetchInterval: pollMs,
    staleTime: MISSING_LIST_STALE_MS,
    // keepPreviousData-like: no parpadear al cambiar de página.
    placeholderData: (prev) => prev,
  });
}

/** Prefetch de páginas vecinas para que paginar sea instantáneo (patrón
 *  recomendado de TanStack: placeholderData + prefetch del siguiente). Devuelve
 *  una fn que el componente llama cuando cambia de página/filtro. No-op si la
 *  página destino está fuera de rango. */
export function usePrefetchMissingPages() {
  const qc = useQueryClient();
  return (params: MissingListParams, totalPages: number) => {
    // Siguiente y anterior: cubre el caso típico de avanzar y el de retroceder.
    for (const page of [params.page + 1, params.page - 1]) {
      if (page < 1 || page > totalPages) continue;
      const p = { ...params, page };
      qc.prefetchQuery({
        queryKey: qk.missing.list(p),
        queryFn: fetchMissingPage(p),
        staleTime: MISSING_LIST_STALE_MS,
      });
    }
  };
}

/** Stats compartidas (reemplaza el poller de found-count redundante del carousel). */
export interface MissingStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
}
export function useMissingStats(pollMs = 60_000) {
  return useQuery({
    queryKey: qk.missing.stats,
    queryFn: ({ signal }) =>
      apiGet<{ stats: MissingStats }>("/api/missing/stats", signal).then((r) => r.stats),
    refetchInterval: pollMs,
  });
}

// ---- Mutaciones ----
export interface CreateMissingInput {
  name: string;
  age?: number | string | null;
  nationality?: string;
  description?: string;
  lastSeen?: string;
  contact?: string;
  photo?: string | null;
  reportType?: "missing" | "found";
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export function useCreateMissing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMissingInput) =>
      apiSend<{ person: MissingPerson }>("POST", "/api/missing", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.missing.all }),
  });
}

export function useDeleteMissing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>("DELETE", `/api/missing/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.missing.all }),
  });
}

export function useMarkFound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; note: string; photo: string | null; turnstileToken?: string }) =>
      apiSend<{ person: MissingPerson }>("POST", `/api/missing/${args.id}/found`, {
        note: args.note,
        photo: args.photo,
        turnstileToken: args.turnstileToken,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.missing.all }),
  });
}
