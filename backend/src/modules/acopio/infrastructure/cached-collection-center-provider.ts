import { cached } from "@/lib/cache";
import type { CollectionCenter } from "../domain/collection-center";
import type { CollectionCenterProvider } from "../domain/collection-center-provider";

/** Decorador: añade cache en proceso a cualquier proveedor sin que el dominio lo sepa. */
export class CachedCollectionCenterProvider implements CollectionCenterProvider {
  readonly sourceName: string;

  constructor(
    private readonly source: CollectionCenterProvider,
    private readonly ttlMs: number,
  ) {
    this.sourceName = source.sourceName;
  }

  list(): Promise<readonly CollectionCenter[]> {
    return cached(`acopio:centers:${this.source.sourceName}`, this.ttlMs, () =>
      this.source.list(),
    );
  }
}
