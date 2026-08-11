import { describe, it, expect } from "vitest";
import { apiHostPrefix, matchesApiHost } from "@/lib/api-host";

// middleware.ts decide "esto es el tier API" a partir de esta regla pura.
// Fijamos el comportamiento con el prefijo real de la plantilla ("api", de
// domains.api = "api.mapa.example.org") más casos hostiles: hosts que
// contienen "api" sin ser el subdominio, y el hermano de staging.

describe("apiHostPrefix", () => {
  it("extrae el primer label del host de API configurado", () => {
    expect(apiHostPrefix("api.mapa.example.org")).toBe("api");
  });
});

describe("matchesApiHost", () => {
  const prefix = "api";

  it("acepta el host de producción", () => {
    expect(matchesApiHost("api.mapa.example.org", prefix)).toBe(true);
  });

  it("acepta el host de producción con puerto (dev local)", () => {
    expect(matchesApiHost("api.localhost:3000", prefix)).toBe(true);
  });

  it("acepta el host hermano de staging (api-staging., no api.staging.)", () => {
    expect(matchesApiHost("api-staging.mapa.example.org", prefix)).toBe(true);
  });

  it("rechaza el host web normal", () => {
    expect(matchesApiHost("mapa.example.org", prefix)).toBe(false);
    expect(matchesApiHost("www.mapa.example.org", prefix)).toBe(false);
  });

  it("rechaza hosts que solo contienen 'api' sin ser el subdominio", () => {
    expect(matchesApiHost("notapi.mapa.example.org", prefix)).toBe(false);
    expect(matchesApiHost("apix.mapa.example.org", prefix)).toBe(false);
  });

  it("rechaza host nulo", () => {
    expect(matchesApiHost(null, prefix)).toBe(false);
  });
});
