/**
 * Router `api/public/capabilities` — catálogo de capacidades (admin RBAC).
 *
 * Solo lectura. Sirve la fuente de verdad (CAPABILITIES) para que la UI pueda
 * construir el selector de capacidades. Lo necesitan DOS funciones: gestionar
 * roles (role:read) y crear API keys self-service (apikey:manage, para elegir
 * los scopes de la llave). Por eso va con requireAnyCapability(role:read,
 * apikey:manage) — el catálogo es una lista fija de nombres+descripciones, sin
 * datos sensibles. No hay escritura: el catálogo es fijo en código.
 */
import { Router } from "express";
import { asyncHandler, rateLimit } from "@/middleware";
import { requireAnyCapability } from "@/middleware/auth";
import { CAPABILITIES } from "@/auth/capabilities";

export const capabilitiesRouter = Router();

capabilitiesRouter.get(
  "/",
  rateLimit({ scope: "public:capabilities:list", limit: 120 }),
  requireAnyCapability("role:read", "apikey:manage"),
  asyncHandler(async (_req, res) => {
    res.json({ items: CAPABILITIES });
  }),
);
