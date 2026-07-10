import type { CollectionCenter } from "./collection-center";

/** Puerto de salida: cada integración (fuente de datos) implementa esta interfaz. */
export interface CollectionCenterProvider {
  readonly sourceName: string;
  list(): Promise<readonly CollectionCenter[]>;
}

export class CollectionCenterProviderError extends Error {
  constructor(
    message: string,
    readonly sourceName: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CollectionCenterProviderError";
  }
}
