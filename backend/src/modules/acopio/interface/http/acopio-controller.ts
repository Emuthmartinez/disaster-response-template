import type { Request, Response } from "express";
import { z } from "zod";
import { jsonWithEtag } from "@/lib/http";
import { badGateway } from "@/lib/errors";
import { createCriteria } from "../../domain/criteria";
import { CollectionCenterProviderError } from "../../domain/collection-center-provider";
import type { ListCollectionCenters } from "../../application/list-collection-centers";
import { toCollectionCenterListView } from "./collection-center-view";

export const listCollectionCentersQuery = z.object({
  country: z.string().trim().optional(),
  category: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
};

export function makeListCollectionCentersHandler(
  listCollectionCenters: ListCollectionCenters,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const { country, category, q } = req.query as unknown as z.infer<
      typeof listCollectionCentersQuery
    >;
    const criteria = createCriteria({ country, category, text: q });
    try {
      const result = await listCollectionCenters.execute(criteria);
      jsonWithEtag(req, res, toCollectionCenterListView(result), CACHE_HEADERS);
    } catch (error) {
      if (error instanceof CollectionCenterProviderError) {
        throw badGateway(error.message); // fuente externa caída → 502, no 500
      }
      throw error;
    }
  };
}
