// Tests unitarios del módulo needs: caso de uso (con geocoder/publisher falsos),
// mapper a ResponseGrid y publisher deshabilitado. Sin red ni env.
import { describe, it, expect } from "vitest";
import type { NewNeed, ResolvedLocation } from "@/modules/needs/domain/need";
import type { Coordinates, Geocoder } from "@/modules/needs/domain/geocoder";
import type { NeedPublisher } from "@/modules/needs/domain/need-publisher";
import { NeedPublishingDisabledError } from "@/modules/needs/domain/need-publisher";
import {
  PublishNeed,
  NeedLocationNotFoundError,
} from "@/modules/needs/application/publish-need";
import { DisabledNeedPublisher } from "@/modules/needs/infrastructure/disabled-need-publisher";
import { toResponseGridNeedPayload } from "@/modules/needs/infrastructure/responsegrid/responsegrid-need-publisher";

const sampleNeed: NewNeed = {
  title: "Agua para refugio",
  description: null,
  priority: "high",
  address: "Distrito Ejemplo, Ciudad Ejemplo",
  items: [{ name: "Agua", quantity: 10, unit: "L", category: "water" }],
  author: null,
};

function geocoderReturning(coords: Coordinates | null): Geocoder {
  return { locate: async () => coords };
}

describe("PublishNeed", () => {
  it("geocodifica y publica con la ubicación resuelta", async () => {
    let captured: ResolvedLocation | undefined;
    const publisher: NeedPublisher = {
      publish: async (_need, location) => {
        captured = location;
        return { id: "n1", status: "pending" };
      },
    };
    const useCase = new PublishNeed(
      geocoderReturning({ latitude: 10.5, longitude: -66.9, label: "Distrito Ejemplo" }),
      publisher,
    );

    const ref = await useCase.execute(sampleNeed);

    expect(ref).toEqual({ id: "n1", status: "pending" });
    expect(captured).toEqual({ address: "Distrito Ejemplo", latitude: 10.5, longitude: -66.9 });
  });

  it("cae a la dirección original cuando el geocoder no da label", async () => {
    let captured: ResolvedLocation | undefined;
    const publisher: NeedPublisher = {
      publish: async (_need, location) => {
        captured = location;
        return { id: "x", status: "pending" };
      },
    };
    const useCase = new PublishNeed(
      geocoderReturning({ latitude: 1, longitude: 2, label: null }),
      publisher,
    );

    await useCase.execute(sampleNeed);

    expect(captured?.address).toBe("Distrito Ejemplo, Ciudad Ejemplo");
  });

  it("lanza NeedLocationNotFoundError si no ubica la dirección", async () => {
    const publisher: NeedPublisher = {
      publish: async () => {
        throw new Error("no debió llamarse");
      },
    };
    const useCase = new PublishNeed(geocoderReturning(null), publisher);

    await expect(useCase.execute(sampleNeed)).rejects.toBeInstanceOf(
      NeedLocationNotFoundError,
    );
  });
});

describe("toResponseGridNeedPayload", () => {
  it("mapea dominio → payload de ResponseGrid", () => {
    const payload = toResponseGridNeedPayload(
      { ...sampleNeed, description: "urgente" },
      { address: "Distrito Ejemplo", latitude: 10.5, longitude: -66.9 },
    );
    expect(payload).toEqual({
      title: "Agua para refugio",
      description: "urgente",
      priority: "high",
      location: { address: "Distrito Ejemplo", latitude: 10.5, longitude: -66.9 },
      items: [{ name: "Agua", quantity: 10, unit: "L", category: "water" }],
    });
  });

  it("omite description cuando es null", () => {
    const payload = toResponseGridNeedPayload(sampleNeed, {
      address: "x",
      latitude: 1,
      longitude: 2,
    });
    expect("description" in payload).toBe(false);
  });

  it("incluye author presente y omite sus subcampos vacíos", () => {
    const payload = toResponseGridNeedPayload(
      {
        ...sampleNeed,
        author: {
          name: "María P.",
          email: "maria@example.org",
          phone: null,
          note: null,
          verified: false,
          source: "example.org",
        },
      },
      { address: "Distrito Ejemplo", latitude: 10.5, longitude: -66.9 },
    );
    expect(payload.author).toEqual({
      name: "María P.",
      email: "maria@example.org",
      verified: false,
      source: "example.org",
    });
  });

  it("omite author cuando es null", () => {
    const payload = toResponseGridNeedPayload(sampleNeed, {
      address: "x",
      latitude: 1,
      longitude: 2,
    });
    expect("author" in payload).toBe(false);
  });
});

describe("DisabledNeedPublisher", () => {
  it("rechaza con NeedPublishingDisabledError", async () => {
    const publisher: NeedPublisher = new DisabledNeedPublisher();
    await expect(
      publisher.publish(sampleNeed, { address: "x", latitude: 1, longitude: 2 }),
    ).rejects.toBeInstanceOf(NeedPublishingDisabledError);
  });
});
