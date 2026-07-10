import type { CollectionCenter } from "./collection-center";

export interface Facets {
  readonly byCountry: Record<string, number>;
  readonly byCategory: Record<string, number>;
}

export function computeFacets(centers: readonly CollectionCenter[]): Facets {
  const byCountry: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const center of centers) {
    if (center.country) {
      byCountry[center.country] = (byCountry[center.country] ?? 0) + 1;
    }
    for (const category of center.accepts) {
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
  }
  return { byCountry, byCategory };
}
