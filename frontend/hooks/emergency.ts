"use client";

/**
 * Hooks de datos del dominio "emergency" (TanStack Query). Espeja el patrón
 * canónico de hooks/missing.ts:
 *  - queries polleadas: useQuery + queryKey de qk.* + refetchInterval
 *    (pausado en background por el client). queryFn usa apiGet (ETag/304).
 *  - mutaciones de admin/confirmación: useMutation + invalidateQueries en onSuccess.
 *  - contrato JSON idéntico al backend (GET /api/reports, GET /api/missing/map,
 *    POST /api/reports/:id/confirm, DELETE /api/reports/:id).
 *
 * IMPORTANTE: la creación de reportes (POST /api/reports) NO vive aquí. Es
 * offline-aware (cola IndexedDB) y vive en lib/offline-queue.ts + post-report.ts
 * — no se migra a TanStack ni se toca su lógica de reintento.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { EmergencyReport, Earthquake } from "@/lib/types";
import type { MissingMapMarker } from "@/hooks/missing";
import type { MapBounds } from "@/components/features/map";

export interface ReportsResponse {
  reports: EmergencyReport[];
  persistent: boolean;
}

/** Lista de reportes de emergencia (polleada). Mismo contrato que el GET. */
export function useReports(pollMs: number) {
  return useQuery({
    queryKey: qk.reports.list,
    queryFn: ({ signal }) => apiGet<ReportsResponse>("/api/reports", signal),
    refetchInterval: pollMs,
    placeholderData: (prev) => prev,
  });
}

export interface EarthquakesResponse {
  earthquakes: Earthquake[];
}

/** Sismos recientes en la región (catálogo USGS, polleado). El backend ya
 * devuelve más-reciente-primero y cachea con ETag; aquí solo polleamos. */
export function useEarthquakes(pollMs: number) {
  return useQuery({
    queryKey: qk.earthquakes.list,
    queryFn: ({ signal }) =>
      apiGet<EarthquakesResponse>("/api/earthquakes", signal).then(
        (r) => r.earthquakes ?? [],
      ),
    refetchInterval: pollMs,
    placeholderData: (prev) => prev,
  });
}

function buildMissingMapUrl(bounds: MapBounds | null): string {
  return bounds
    ? `/api/missing/map?north=${bounds.north}&south=${bounds.south}&east=${bounds.east}&west=${bounds.west}&limit=800`
    : "/api/missing/map?limit=800";
}

export interface MissingMapResponse {
  markers: MissingMapMarker[];
}

/** Marcadores de desaparecidos para el mapa, acotados al viewport (bounds).
 *  El caller DEBE pasar bounds ya debounced (~350ms) para no pedir por cada pan. */
export function useMissingMap(bounds: MapBounds | null) {
  return useQuery({
    queryKey: qk.missing.map(bounds),
    queryFn: ({ signal }) =>
      apiGet<MissingMapResponse>(buildMissingMapUrl(bounds), signal).then(
        (r) => r.markers ?? [],
      ),
    placeholderData: (prev) => prev,
  });
}

// ---- Mutaciones ----

/** Confirma un reporte ("yo también lo veo"). El backend dedup por dispositivo. */
export function useConfirmReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend<unknown>("POST", `/api/reports/${id}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reports.all }),
  });
}

/** Marca un reporte como atendido (admin → DELETE con token). */
export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; adminToken: string }) =>
      apiSend<void>("DELETE", `/api/reports/${args.id}`, undefined, {
        "x-admin-token": args.adminToken,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reports.all }),
  });
}
