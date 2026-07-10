/**
 * Synthetic, obviously-fake event data for the "riesgo sísmico" (seismic risk)
 * reference page. A real deployment replaces this file entirely (via the
 * disaster-configure tooling, or by hand) with the actual event metadata and
 * the list of at-risk localities for that disaster.
 *
 * Nothing here should ever ship to production as-is — every value is a
 * placeholder ("Ciudad Ejemplo" and friends) so a template consumer notices
 * immediately if they forgot to configure it.
 */
import { deploymentConfig } from "@/lib/deployment-config";

export interface SeismicRiskEventMeta {
  title: string;
  eventId: string;
  occurredAt: string;
  source: string;
  sourceUrl: string;
}

/** EXAMPLE metadata for the disaster event. Replace with the real event. */
export const SEISMIC_RISK_EVENT: SeismicRiskEventMeta = {
  title: `Ejemplo M0.0 — Evento sísmico de referencia (${deploymentConfig.disasterName})`,
  eventId: "example-event-id",
  occurredAt: "2026-01-01T00:00:00Z",
  source: "Fuente de ejemplo",
  sourceUrl: "https://example.org/evento-sismico-referencia",
};

export type SeismicRiskLevel = "critical" | "high";

export interface SeismicRiskCity {
  rank: number;
  city: string;
  state: string;
  level: SeismicRiskLevel;
  mmi: number;
  population: number;
  lat: number;
  lng: number;
}

/** EXAMPLE cities — replace with the real at-risk localities for the deployment. */
export const SEISMIC_RISK_CITIES: SeismicRiskCity[] = [
  {
    rank: 1,
    city: "Ciudad Ejemplo Uno",
    state: "Región Ejemplo",
    level: "critical",
    mmi: 7.5,
    population: 200000,
    lat: deploymentConfig.mapCenter[0] + 0.5,
    lng: deploymentConfig.mapCenter[1] + 0.5,
  },
  {
    rank: 2,
    city: "Ciudad Ejemplo Dos",
    state: "Región Ejemplo",
    level: "critical",
    mmi: 7.2,
    population: 150000,
    lat: deploymentConfig.mapCenter[0] - 0.4,
    lng: deploymentConfig.mapCenter[1] + 0.3,
  },
  {
    rank: 3,
    city: "Ciudad Ejemplo Tres",
    state: "Región Ejemplo",
    level: "high",
    mmi: 6.5,
    population: 80000,
    lat: deploymentConfig.mapCenter[0] + 0.2,
    lng: deploymentConfig.mapCenter[1] - 0.6,
  },
];

export interface SeismicRiskAoi {
  name: string;
  area: string;
  criticalBuildings: number;
  basis: string;
  center: [number, number];
  radiusKm: number;
}

/** EXAMPLE areas of interest — replace with the real ones for the deployment. */
export const SEISMIC_RISK_AOIS: SeismicRiskAoi[] = [
  {
    name: "Ciudad Ejemplo Uno y alrededores",
    area: "Zona de ejemplo",
    criticalBuildings: 10,
    basis: "Datos de ejemplo — reemplazar con el análisis real.",
    center: [deploymentConfig.mapCenter[0], deploymentConfig.mapCenter[1]],
    radiusKm: 20,
  },
];
