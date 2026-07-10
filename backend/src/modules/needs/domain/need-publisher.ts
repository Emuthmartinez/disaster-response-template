import type { NewNeed, PublishedNeedRef, ResolvedLocation } from "./need";

/** Puerto de salida: publica una necesidad en la fuente externa (hoy ResponseGrid). */
export interface NeedPublisher {
  publish(need: NewNeed, location: ResolvedLocation): Promise<PublishedNeedRef>;
}

/** La fuente externa rechazó la necesidad o no respondió. */
export class NeedPublishError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NeedPublishError";
  }
}

/** Falta la credencial de servicio: el endpoint debe responder 503, no 500. */
export class NeedPublishingDisabledError extends Error {
  constructor() {
    super("La publicación de necesidades no está disponible en este momento.");
    this.name = "NeedPublishingDisabledError";
  }
}
