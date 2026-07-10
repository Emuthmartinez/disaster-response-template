import { describe, it, expect } from "vitest";
import { severityMeta, SEVERITY, SEVERITY_LEVELS } from "@/lib/severity";

describe("severityMeta", () => {
  it("devuelve la metadata correcta para 1..4", () => {
    expect(severityMeta(1).label).toBe("Leve");
    expect(severityMeta(2).label).toBe("Moderado");
    expect(severityMeta(3).label).toBe("Severo");
    expect(severityMeta(4).label).toBe("Colapsado");
  });

  it("hace fallback a 'Leve' ante valores inesperados", () => {
    expect(severityMeta(0)).toBe(SEVERITY[1]);
    expect(severityMeta(5)).toBe(SEVERITY[1]);
    expect(severityMeta(-1)).toBe(SEVERITY[1]);
    expect(severityMeta(Number.NaN)).toBe(SEVERITY[1]);
  });

  it("expone exactamente 4 niveles", () => {
    expect(SEVERITY_LEVELS).toEqual([1, 2, 3, 4]);
  });
});
