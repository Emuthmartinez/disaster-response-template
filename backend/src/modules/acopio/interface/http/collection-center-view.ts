import type { CollectionCenter } from "../../domain/collection-center";
import type { CollectionCenterList } from "../../application/list-collection-centers";

/** Contrato JSON público de /api/acopio (aplana location a address/lat/lng). */
export interface CollectionCenterView {
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

export interface CollectionCenterListView {
  items: CollectionCenterView[];
  total: number;
  facets: {
    byCountry: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

export function toCollectionCenterView(
  center: CollectionCenter,
): CollectionCenterView {
  return {
    id: center.id,
    name: center.name,
    manager: center.manager,
    address: center.location.address,
    city: center.city,
    country: center.country,
    lat: center.location.latitude,
    lng: center.location.longitude,
    accepts: [...center.accepts],
    contact: center.contact,
    schedule: center.schedule,
    status: center.status,
    verificationLevel: center.verificationLevel,
    disputed: center.disputed,
    description: center.description,
  };
}

export function toCollectionCenterListView(
  list: CollectionCenterList,
): CollectionCenterListView {
  return {
    items: list.items.map(toCollectionCenterView),
    total: list.total,
    facets: {
      byCountry: list.facets.byCountry,
      byCategory: list.facets.byCategory,
    },
  };
}
