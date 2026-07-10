"use client";

/**
 * Hook de datos del dominio "acopio" (centros de acopio) — sigue el patrón
 * canónico de hooks/hospitals.ts. El backend proxea ResponseGrid en /api/acopio
 * (cache + ETag), así que el navegador solo habla con NUESTRO backend vía apiGet.
 *
 * El filtrado (país/categoría/texto) ocurre en el servidor sobre el set cacheado;
 * las facetas vienen en la misma respuesta para poblar los chips de filtro. El
 * componente hace "ver más" en cliente sobre la lista ya filtrada.
 *
 * Los tipos y helpers puros (URL, filtros por defecto) viven en lib/acopio.ts
 * para poder reutilizarlos en el prefetch SSR del servidor.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  buildAcopioUrl,
  type AcopioFilters,
  type AcopioResponse,
} from "@/lib/acopio";

/**
 * El módulo de acopio/ResponseGrid está gateado en el backend por
 * ENABLE_RESPONSEGRID y puede no estar habilitado en un deployment dado. En
 * ese caso el backend responde 404 (o el módulo simplemente no existe en un
 * fork del template) — tratamos eso como "módulo desactivado", no como un
 * error de red, para que la UI oculte la sección en vez de mostrar un estado
 * de error.
 */
export function isModuleDisabledError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// Re-export para los consumidores existentes que importan desde "@/hooks/acopio".
export {
  ACOPIO_DEFAULT_COUNTRY,
  ACOPIO_DEFAULT_FILTERS,
  buildAcopioUrl,
  deriveAcopioOperationalSummary,
  isCollectionCenterOperational,
  normalizeAcopioFacets,
  type AcopioFilters,
  type AcopioOperationalSummary,
  type AcopioResponse,
  type AcopioFacets,
  type CollectionCenter,
} from "@/lib/acopio";

const ACOPIO_STALE_MS = 2 * 60_000;

/**
 * Centros de acopio filtrados + facetas. El término `q` debe venir ya debounced
 * del componente. `placeholderData` evita parpadeo al cambiar de filtro.
 */
export function useCollectionCenters(filters: AcopioFilters) {
  return useQuery({
    queryKey: qk.acopio.list(filters),
    queryFn: ({ signal }) => apiGet<AcopioResponse>(buildAcopioUrl(filters), signal),
    staleTime: ACOPIO_STALE_MS,
    placeholderData: (prev) => prev,
    // No reintentar cuando el módulo está desactivado (404): es un estado
    // esperado, no una falla transitoria de red.
    retry: (failureCount, error) =>
      !isModuleDisabledError(error) && failureCount < 3,
  });
}
