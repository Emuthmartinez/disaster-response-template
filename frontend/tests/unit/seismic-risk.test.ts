import { describe, it, expect } from "vitest";
import {
  SEISMIC_RISK_CITIES,
  SEISMIC_RISK_AOIS,
  SEISMIC_RISK_TOTALS,
} from "@/lib/seismic-risk";
import { deploymentConfig } from "@/lib/deployment-config";

// Invariantes de los datos mostrados al usuario: atrapan errores de captura
// cuando se actualiza el dataset (ranks repetidos, niveles inválidos, etc.).
describe("SEISMIC_RISK_CITIES (integridad del dataset)", () => {
  it("tiene ranks únicos y secuenciales 1..N", () => {
    const ranks = SEISMIC_RISK_CITIES.map((c) => c.rank);
    expect(ranks).toEqual(
      Array.from({ length: SEISMIC_RISK_CITIES.length }, (_, i) => i + 1),
    );
  });

  it("usa solo niveles válidos y está ordenado por mmi descendente", () => {
    for (const c of SEISMIC_RISK_CITIES) {
      expect(["critical", "high"]).toContain(c.level);
      expect(c.population).toBeGreaterThan(0);
      // Coordenadas dentro de un bounding box plausible alrededor del centro
      // configurado (config/deployment.config.json) — cada deployment define
      // su propio dataset, así que solo validamos que sea "cercano".
      expect(c.lat).toBeGreaterThan(deploymentConfig.mapCenter[0] - 5);
      expect(c.lat).toBeLessThan(deploymentConfig.mapCenter[0] + 5);
      expect(c.lng).toBeGreaterThan(deploymentConfig.mapCenter[1] - 5);
      expect(c.lng).toBeLessThan(deploymentConfig.mapCenter[1] + 5);
    }
    const mmis = SEISMIC_RISK_CITIES.map((c) => c.mmi);
    expect(mmis).toEqual([...mmis].sort((a, b) => b - a));
  });
});

describe("SEISMIC_RISK_TOTALS (agregados derivados)", () => {
  it("coincide con el conteo real de ciudades por nivel", () => {
    const critical = SEISMIC_RISK_CITIES.filter((c) => c.level === "critical").length;
    const high = SEISMIC_RISK_CITIES.filter((c) => c.level === "high").length;
    expect(SEISMIC_RISK_TOTALS.criticalCities).toBe(critical);
    expect(SEISMIC_RISK_TOTALS.highCities).toBe(high);
    expect(critical + high).toBe(SEISMIC_RISK_CITIES.length);
  });

  it("suma los edificios críticos de todas las AOIs", () => {
    const sum = SEISMIC_RISK_AOIS.reduce((s, a) => s + a.criticalBuildings, 0);
    expect(SEISMIC_RISK_TOTALS.criticalBuildings).toBe(sum);
  });
});
