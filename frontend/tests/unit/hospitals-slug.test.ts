import { describe, it, expect } from "vitest";
import {
  slugifyHospitalPart,
  buildHospitalSlug,
  matchesHospitalSlug,
} from "@/lib/hospitals-meta";

// Routing crítico: /hospitales/[id] resuelve y redirige al slug canónico
// (buildHospitalSlug). Si el slug cambia de forma, los enlaces del directorio
// rompen. Estos tests fijan el contrato.

const HOSP = {
  name: "Hospital de Niños J. M. de los Ríos",
  municipality: "Libertador",
  state: "Distrito Capital",
};

describe("slugifyHospitalPart", () => {
  it("normaliza acentos, mayúsculas y separadores", () => {
    expect(slugifyHospitalPart("Hospital de Niños J. M. de los Ríos")).toBe(
      "hospital-de-ninos-j-m-de-los-rios",
    );
  });

  it("recorta guiones sobrantes y caracteres no alfanuméricos", () => {
    expect(slugifyHospitalPart("  ¡Hola!  ")).toBe("hola");
    expect(slugifyHospitalPart("---a---b---")).toBe("a-b");
  });
});

describe("buildHospitalSlug", () => {
  it("combina nombre + municipio", () => {
    expect(buildHospitalSlug(HOSP)).toBe(
      "hospital-de-ninos-j-m-de-los-rios-libertador",
    );
  });

  it("cae al estado cuando no hay municipio", () => {
    expect(buildHospitalSlug({ ...HOSP, municipality: "" })).toBe(
      "hospital-de-ninos-j-m-de-los-rios-distrito-capital",
    );
  });

  it("es estable (mismo input → mismo slug)", () => {
    expect(buildHospitalSlug(HOSP)).toBe(buildHospitalSlug(HOSP));
  });
});

describe("matchesHospitalSlug", () => {
  it("reconoce el slug canónico", () => {
    expect(matchesHospitalSlug(HOSP, buildHospitalSlug(HOSP))).toBe(true);
  });

  it("reconoce el slug solo-nombre", () => {
    expect(matchesHospitalSlug(HOSP, "hospital-de-ninos-j-m-de-los-rios")).toBe(
      true,
    );
  });

  it("rechaza un slug ajeno", () => {
    expect(matchesHospitalSlug(HOSP, "otro-hospital")).toBe(false);
  });
});
