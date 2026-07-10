/**
 * Derived/aggregate helpers for the "riesgo sísmico" reference page. The raw,
 * per-deployment event + city data lives in `lib/event-data.ts` (synthetic
 * example data — `disaster-configure` populates the real values). This module
 * only re-exports that data plus a couple of generic reference links and the
 * totals derived from it, so pages don't need to recompute aggregates.
 */
import {
  SEISMIC_RISK_AOIS,
  SEISMIC_RISK_CITIES,
  SEISMIC_RISK_EVENT,
} from "@/lib/event-data";

export {
  SEISMIC_RISK_EVENT,
  SEISMIC_RISK_CITIES,
  SEISMIC_RISK_AOIS,
  type SeismicRiskLevel,
  type SeismicRiskCity,
  type SeismicRiskAoi,
} from "@/lib/event-data";

/** Punto de edificio priorizado (huella OSM). El template no trae un dataset
 *  real: `disaster-configure` puede poblar `data/derived/...json` y adaptar
 *  el mapa para consumirlo si el deployment lo necesita. */
export interface SeismicRiskBuildingPoint {
  id: string;
  osmType: string;
  osmId: number;
  areaId: string;
  areaName: string;
  lat: number;
  lng: number;
  priorityScore: number;
  label: string | null;
  building: string;
  amenity: string | null;
}

/** Fuente sísmica del evento configurado (ver lib/event-data.ts). */
export const USGS_EVENT_URL = SEISMIC_RISK_EVENT.sourceUrl;

export const OSM_URL = "https://www.openstreetmap.org/";

export const OVERPASS_URL = "https://overpass-turbo.eu/";

export const SEISMIC_RISK_TOTALS = {
  criticalCities: SEISMIC_RISK_CITIES.filter(
    (city) => city.level === "critical",
  ).length,
  highCities: SEISMIC_RISK_CITIES.filter((city) => city.level === "high")
    .length,
  criticalBuildings: SEISMIC_RISK_AOIS.reduce(
    (sum, area) => sum + area.criticalBuildings,
    0,
  ),
};
