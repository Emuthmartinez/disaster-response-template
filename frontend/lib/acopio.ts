// Tipos y helpers puros del dominio "acopio" (sin React ni TanStack Query).
// Viven aquí —y NO en hooks/acopio.ts ("use client")— para poder reutilizarlos
// desde el servidor (prefetch SSR en app/(content)/acopio/page.tsx) sin cruzar
// la frontera cliente/servidor.
import { deploymentConfig } from "@/lib/deployment-config";

export interface CollectionCenter {
  id: string;
  name: string;
  manager: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  accepts: string[];
  contact: string | null;
  schedule: string | null;
  status: string;
  verificationLevel: string;
  disputed: boolean;
  description: string | null;
}

export interface AcopioFacets {
  byCountry: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface AcopioResponse {
  items: CollectionCenter[];
  total: number;
  facets: AcopioFacets;
}

export interface AcopioFilters {
  country?: string;
  category?: string;
  q?: string;
}

export interface AcopioOperationalSummary {
  pointsOnMap: number;
  operationalCount: number;
  networkCountryCount: number;
}

const CLOSED_STATUS = "closed";

export function isCollectionCenterOperational(status: string): boolean {
  return status !== CLOSED_STATUS;
}

export function normalizeAcopioFacets(
  facets: AcopioFacets | undefined,
): AcopioFacets {
  return facets ?? { byCountry: {}, byCategory: {} };
}

/** Métricas del bloque «Resumen del operativo» a partir del contrato /api/acopio. */
export function deriveAcopioOperationalSummary(
  response: AcopioResponse,
): AcopioOperationalSummary {
  const facets = normalizeAcopioFacets(response.facets);
  const items = response.items;
  return {
    pointsOnMap: items.filter((c) => c.lat != null && c.lng != null).length,
    operationalCount: items.filter((c) =>
      isCollectionCenterOperational(c.status),
    ).length,
    networkCountryCount: Object.keys(facets.byCountry).length,
  };
}

/** País por defecto del directorio: override con
 *  NEXT_PUBLIC_ACOPIO_DEFAULT_COUNTRY, o el regionLabel del deployment. */
export const ACOPIO_DEFAULT_COUNTRY =
  process.env.NEXT_PUBLIC_ACOPIO_DEFAULT_COUNTRY?.trim() ||
  deploymentConfig.regionLabel;

/** Filtros del primer render del directorio. Deben coincidir con el estado
 *  inicial de CollectionCenters para que el prefetch SSR hidrate sin re-fetch. */
export const ACOPIO_DEFAULT_FILTERS: AcopioFilters = {
  country: ACOPIO_DEFAULT_COUNTRY,
};

export function buildAcopioUrl(f: AcopioFilters): string {
  const sp = new URLSearchParams();
  if (f.country) sp.set("country", f.country);
  if (f.category) sp.set("category", f.category);
  if (f.q) sp.set("q", f.q);
  const qs = sp.toString();
  return qs ? `/api/acopio?${qs}` : "/api/acopio";
}
