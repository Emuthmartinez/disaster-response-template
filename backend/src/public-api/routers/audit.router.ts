/**
 * Router `api/public/audit` — lectura de la bitácora de auditoría (admin RBAC).
 *
 * Solo lectura, gateado por audit:read. Paginación keyset (?before=<id>).
 *   GET /  (audit:read)  lista entradas, más reciente primero
 *
 * No hay escritura por API (la auditoría la escribe el sistema en cada
 * mutación). rateLimit + requireCapability igualmente (gate ESLint).
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import * as service from "@/services/audit";

export const auditRouter = Router();

const listQuery = z.object({
  actorUserId: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

auditRouter.get(
  "/",
  rateLimit({ scope: "public:audit:list", limit: 120 }),
  requireCapability("audit:read"),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof listQuery>;
    res.json({ items: await service.listAudit(q) });
  }),
);
