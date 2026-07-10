import type { Router } from "express";
import { env } from "@/config/env";
import { ListCollectionCenters } from "./application/list-collection-centers";
import { ResponseGridClient } from "./infrastructure/responsegrid/responsegrid-client";
import { ResponseGridCollectionCenterProvider } from "./infrastructure/responsegrid/responsegrid-collection-center-provider";
import { CachedCollectionCenterProvider } from "./infrastructure/cached-collection-center-provider";
import { createAcopioRouter } from "./interface/http/acopio-router";

const CACHE_TTL_MS = 120_000;
const REQUEST_TIMEOUT_MS = 5_000;
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Composition root: único punto que lee env y cablea las piezas concretas.
 * Solo se llama cuando ENABLE_RESPONSEGRID=true (ver modules/acopio/index.ts);
 * env.ts ya valida en el arranque que RESPONSEGRID_API_URL/
 * RESPONSEGRID_EMERGENCY_SLUG estén presentes en ese caso — el guard de abajo
 * es defensivo (nunca debería disparar en producción).
 */
export function buildAcopioRouter(): Router {
  if (!env.RESPONSEGRID_API_URL || !env.RESPONSEGRID_EMERGENCY_SLUG) {
    throw new Error(
      "buildAcopioRouter() requiere RESPONSEGRID_API_URL y RESPONSEGRID_EMERGENCY_SLUG " +
        "(ENABLE_RESPONSEGRID=true debería haber fallado antes en env.ts si faltan).",
    );
  }
  const responseGrid = new ResponseGridClient({
    baseUrl: env.RESPONSEGRID_API_URL,
    emergencySlug: env.RESPONSEGRID_EMERGENCY_SLUG,
    timeoutMs: REQUEST_TIMEOUT_MS,
    refreshTimeoutMs: REFRESH_TIMEOUT_MS,
  });

  const provider = new CachedCollectionCenterProvider(
    new ResponseGridCollectionCenterProvider(responseGrid),
    CACHE_TTL_MS,
  );

  return createAcopioRouter(new ListCollectionCenters(provider));
}
