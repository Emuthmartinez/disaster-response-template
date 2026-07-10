import { describe, expect, it } from "vitest";
import {
  deriveAcopioOperationalSummary,
  isCollectionCenterOperational,
  normalizeAcopioFacets,
  type AcopioResponse,
  type CollectionCenter,
} from "@/lib/acopio";

function center(overrides: Partial<CollectionCenter> = {}): CollectionCenter {
  return {
    id: "1",
    name: "Centro",
    manager: null,
    address: null,
    city: null,
    country: "País Ejemplo",
    lat: 10,
    lng: -66,
    accepts: [],
    contact: null,
    schedule: null,
    status: "active",
    verificationLevel: "verified",
    disputed: false,
    description: null,
    ...overrides,
  };
}

describe("acopio operational summary", () => {
  it("isCollectionCenterOperational excluye cerrados", () => {
    expect(isCollectionCenterOperational("active")).toBe(true);
    expect(isCollectionCenterOperational("saturated")).toBe(true);
    expect(isCollectionCenterOperational("paused")).toBe(true);
    expect(isCollectionCenterOperational("closed")).toBe(false);
  });

  it("normalizeAcopioFacets tolera facetas ausentes", () => {
    expect(normalizeAcopioFacets(undefined)).toEqual({
      byCountry: {},
      byCategory: {},
    });
  });

  it("deriveAcopioOperationalSummary cuenta mapa, operativos y países", () => {
    const response: AcopioResponse = {
      items: [
        center({ id: "1", status: "active" }),
        center({ id: "2", status: "closed", lat: null, lng: null }),
        center({ id: "3", status: "saturated", country: "Otro País" }),
      ],
      total: 3,
      facets: {
        byCountry: { "País Ejemplo": 2, "Otro País": 1 },
        byCategory: { food: 1 },
      },
    };

    expect(deriveAcopioOperationalSummary(response)).toEqual({
      pointsOnMap: 2,
      operationalCount: 2,
      networkCountryCount: 2,
    });
  });
});
