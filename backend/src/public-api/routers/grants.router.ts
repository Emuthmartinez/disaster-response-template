/**
 * Router `api/public/grants` — grants de capacidad individuales (admin RBAC).
 *
 * Verbos: grant:read (ver) y grant:manage (conceder/revocar). No es CRUD →
 * router a mano.
 *   GET    /?userId=…   (grant:read)    lista grants (de un usuario o todos)
 *   POST   /            (grant:manage)  concede una capacidad a un usuario
 *   DELETE /:id         (grant:manage)  revoca un grant
 *
 * Todas: rateLimit + requireCapability + writeAudit.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { notFound } from "@/lib/errors";
import * as service from "@/services/grants";

export const grantsRouter = Router();

const listQuery = z.object({ userId: z.string().min(1).optional() });
const createBody = z.object({
  userId: z.string().min(1, "Indica el usuario."),
  capabilityKey: z.string().trim().min(3).max(64),
  expiresAt: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().max(280).optional(),
});
const idParams = z.object({ id: z.string().min(1, "Falta el id.") });

grantsRouter.get(
  "/",
  rateLimit({ scope: "public:grant:list", limit: 120 }),
  requireCapability("grant:read"),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { userId } = req.query as z.infer<typeof listQuery>;
    res.json({ items: await service.listGrants({ userId }) });
  }),
);

grantsRouter.post(
  "/",
  rateLimit({ scope: "public:grant:create", limit: 60 }),
  requireCapability("grant:manage"),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createBody>;
    const item = await service.grantToUser(input, req.user!.id);
    await writeAudit(req, {
      action: "grant.create",
      targetType: "user",
      targetId: input.userId,
      metadata: { capabilityKey: input.capabilityKey },
    });
    res.status(201).json({ item });
  }),
);

grantsRouter.delete(
  "/:id",
  rateLimit({ scope: "public:grant:delete", limit: 60 }),
  requireCapability("grant:manage"),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const ok = await service.revokeGrant(id, req.user!.id);
    if (!ok) throw notFound("Grant no encontrado.");
    await writeAudit(req, { action: "grant.revoke", targetType: "grant", targetId: id });
    res.json({ ok: true });
  }),
);
