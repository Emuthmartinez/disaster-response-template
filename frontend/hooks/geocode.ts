"use client";

/**
 * Hooks de datos del dominio "geocode" — patrón canónico TanStack (ver hooks/missing.ts).
 *
 * La búsqueda de direcciones es EXPLÍCITA (el usuario envía el formulario), no
 * search-as-you-type, así que se modela como useMutation: el componente dispara
 * `mutate({ q, bias })` en el submit y lee `data.results`. Sin polling, sin
 * fetch a mano. Misma forma que las mutaciones de hooks/missing.ts.
 */
import { useMutation } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export interface GeocodeResponse {
  results: GeocodeResult[];
}

export interface GeocodeParams {
  q: string;
  bias?: { lat: number; lng: number };
}

function buildGeocodeUrl(p: GeocodeParams): string {
  const sp = new URLSearchParams({ q: p.q });
  if (p.bias) {
    sp.set("lat", String(p.bias.lat));
    sp.set("lng", String(p.bias.lng));
  }
  return `/api/geocode?${sp.toString()}`;
}

/** Geocodifica una dirección bajo demanda (submit del formulario). */
export function useGeocodeSearch() {
  return useMutation({
    mutationFn: (params: GeocodeParams) =>
      apiGet<GeocodeResponse>(buildGeocodeUrl(params)),
  });
}
