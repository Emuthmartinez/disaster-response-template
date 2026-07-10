import type { NewNeed, PublishedNeedRef, ResolvedLocation } from "../domain/need";
import type { Geocoder } from "../domain/geocoder";
import type { NeedPublisher } from "../domain/need-publisher";

/** La dirección indicada no se pudo geocodificar. */
export class NeedLocationNotFoundError extends Error {
  constructor(readonly address: string) {
    super("No pudimos ubicar la dirección indicada.");
    this.name = "NeedLocationNotFoundError";
  }
}

/** Geocodifica la dirección y delega la creación en el publisher. */
export class PublishNeed {
  constructor(
    private readonly geocoder: Geocoder,
    private readonly publisher: NeedPublisher,
  ) {}

  async execute(need: NewNeed): Promise<PublishedNeedRef> {
    const coordinates = await this.geocoder.locate(need.address);
    if (!coordinates) {
      throw new NeedLocationNotFoundError(need.address);
    }
    return this.publisher.publish(need, {
      address: coordinates.label ?? need.address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
  }

  /** Para callers que ya tienen coordenadas (p.ej. un reporte del mapa). */
  executeAtLocation(
    need: NewNeed,
    location: ResolvedLocation,
  ): Promise<PublishedNeedRef> {
    return this.publisher.publish(need, location);
  }
}
