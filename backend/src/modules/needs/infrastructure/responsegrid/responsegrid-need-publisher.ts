import type {
  Author,
  NewNeed,
  PublishedNeedRef,
  ResolvedLocation,
} from "../../domain/need";
import type { NeedPublisher } from "../../domain/need-publisher";
import {
  ResponseGridNeedsClient,
  type ResponseGridAuthorPayload,
  type ResponseGridNeedPayload,
} from "./responsegrid-needs-client";

function toAuthorPayload(author: Author): ResponseGridAuthorPayload {
  return {
    ...(author.name ? { name: author.name } : {}),
    ...(author.email ? { email: author.email } : {}),
    ...(author.phone ? { phone: author.phone } : {}),
    ...(author.note ? { note: author.note } : {}),
    verified: author.verified,
    source: author.source,
  };
}

/** Traduce el modelo de dominio al payload de ResponseGrid (pura). */
export function toResponseGridNeedPayload(
  need: NewNeed,
  location: ResolvedLocation,
): ResponseGridNeedPayload {
  return {
    title: need.title,
    ...(need.description ? { description: need.description } : {}),
    priority: need.priority,
    location: {
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    items: need.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    })),
    ...(need.author ? { author: toAuthorPayload(need.author) } : {}),
  };
}

export class ResponseGridNeedPublisher implements NeedPublisher {
  constructor(private readonly client: ResponseGridNeedsClient) {}

  async publish(
    need: NewNeed,
    location: ResolvedLocation,
  ): Promise<PublishedNeedRef> {
    return this.client.createNeed(toResponseGridNeedPayload(need, location));
  }
}
