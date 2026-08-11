// Tipos y helpers puros del dominio "missing" (sin React ni TanStack Query).
// Viven aquí —y NO en hooks/missing.ts ("use client")— para poder reutilizarlos
// desde el servidor (prefetch SSR en app/(app)/page.tsx) sin cruzar la frontera
// cliente/servidor. Mismo patrón que lib/acopio.ts.

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

export interface MissingStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
}

export interface MissingListParams {
  status: "active" | "found" | "all";
  page: number;
  pageSize: number;
  q?: string;
}

/** Mínimo de caracteres para que el backend trate `q` como búsqueda real. */
export const MIN_SEARCH_LEN = 3;

/**
 * Tamaño de página del directorio de personas. FIJO a propósito.
 *
 * Antes se derivaba del nº de columnas del grid (`gridCols * 2|4`), que solo se
 * conoce DESPUÉS de montar (media queries). Eso rompía dos cosas:
 *  1. el prefetch SSR era imposible: el servidor no sabe qué pageSize pedirá el
 *     cliente, así que la queryKey nunca coincidía y la hidratación no servía;
 *  2. en cualquier viewport que no fuera XL, el primer render pedía pageSize=8
 *     y el efecto lo cambiaba acto seguido → DOS requests, la primera tirada.
 * Con un valor fijo la clave del servidor y la del cliente son idénticas y la
 * lista aparece con el HTML. El grid sigue siendo responsive (CSS); solo deja
 * de mandar sobre cuántos registros se piden.
 */
export const MISSING_LIST_PAGE_SIZE = 8;

/** Estado inicial del directorio: mismo valor en servidor y en PersonsTab. */
export const MISSING_DEFAULT_LIST_PARAMS: MissingListParams = {
  status: "all",
  page: 1,
  pageSize: MISSING_LIST_PAGE_SIZE,
};

/** URL relativa del listado. Compartida por el hook cliente y el prefetch SSR
 *  para garantizar que ambos piden EXACTAMENTE lo mismo. */
export function buildMissingUrl(p: MissingListParams): string {
  const sp = new URLSearchParams({
    status: p.status,
    page: String(p.page),
    pageSize: String(p.pageSize),
  });
  if (p.q && p.q.length >= MIN_SEARCH_LEN) sp.set("q", p.q);
  return `/api/missing?${sp.toString()}`;
}
