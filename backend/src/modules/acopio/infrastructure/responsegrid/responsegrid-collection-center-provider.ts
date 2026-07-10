import type { CollectionCenter } from "../../domain/collection-center";
import type { CollectionCenterProvider } from "../../domain/collection-center-provider";
import { ResponseGridClient, RESPONSEGRID_SOURCE } from "./responsegrid-client";
import {
  isCollectionPoint,
  toCollectionCenter,
} from "./responsegrid-collection-center-mapper";

export class ResponseGridCollectionCenterProvider
  implements CollectionCenterProvider
{
  readonly sourceName = RESPONSEGRID_SOURCE;

  constructor(private readonly client: ResponseGridClient) {}

  async list(): Promise<readonly CollectionCenter[]> {
    const resources = await this.client.listAllResources();
    return resources.filter(isCollectionPoint).map(toCollectionCenter);
  }
}
