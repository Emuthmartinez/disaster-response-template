import { describe, expect, it } from "vitest";
import { MODELS, getModel } from "@/src/contexts/models/model-registry";

describe("model-registry", () => {
  it("expone los 7 modelos del backend public-api", () => {
    const paths = MODELS.map((m) => m.path).sort();
    expect(paths).toEqual(
      ["chat", "contact", "donations", "hospitals", "missing", "patients", "reports"].sort(),
    );
  });

  it("cada modelo gatea por <path>:read", () => {
    for (const m of MODELS) {
      expect(m.readCapability).toBe(`${capabilityRoot(m.path)}:read`);
    }
  });

  it("getModel encuentra por path y devuelve undefined si no existe", () => {
    expect(getModel("reports")?.label).toBe("Reportes");
    expect(getModel("nope")).toBeUndefined();
  });

  it("cada modelo declara al menos una columna", () => {
    for (const m of MODELS) {
      expect(m.columns.length).toBeGreaterThan(0);
    }
  });
});

// El path plural del recurso vs la raíz singular de la capacidad
// (reports->report, missing->missing, hospitals->hospital, ...).
function capabilityRoot(path: string): string {
  const map: Record<string, string> = {
    reports: "report",
    missing: "missing",
    hospitals: "hospital",
    patients: "patient",
    donations: "donation",
    chat: "chat",
    contact: "contact",
  };
  return map[path] ?? path;
}
