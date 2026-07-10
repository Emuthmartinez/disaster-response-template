import type { CollectionCenter } from "../domain/collection-center";
import {
  satisfiesCriteria,
  type CollectionCenterCriteria,
} from "../domain/criteria";
import { computeFacets, type Facets } from "../domain/facets";
import type { CollectionCenterProvider } from "../domain/collection-center-provider";

export interface CollectionCenterList {
  readonly items: readonly CollectionCenter[];
  readonly total: number;
  readonly facets: Facets;
}

export class ListCollectionCenters {
  constructor(private readonly provider: CollectionCenterProvider) {}

  async execute(
    criteria: CollectionCenterCriteria,
  ): Promise<CollectionCenterList> {
    const allCenters = await this.provider.list();
    const matching = allCenters.filter((center) =>
      satisfiesCriteria(center, criteria),
    );
    return {
      items: matching,
      total: matching.length,
      facets: computeFacets(allCenters),
    };
  }
}
