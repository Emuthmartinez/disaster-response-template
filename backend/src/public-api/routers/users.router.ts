/**
 * Router `api/public/users` — gestión de usuarios (admin RBAC).
 *
 * Escrito a mano (no fábrica CRUD) porque los verbos son irregulares:
 *   GET    /            (user:read)    lista usuarios
 *   GET    /:id         (user:read)    un usuario
 *   PATCH  /:id         (user:edit)    cambia rol / estado / nombre
 *   DELETE /:id         (user:delete)  desactiva (soft delete)
 *
 * `invite` vive en routes/auth.ts (user:invite). Todas las rutas: rateLimit +
 * requireCapability + writeAudit (gates que exige el ESLint del repo).
 *
 * Guardia anti-lockout: no puedes desactivarte ni quitarte el rol a ti mismo.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { badRequest, notFound } from "@/lib/errors";
import * as service from "@/services/users";

export const usersRouter = Router();

const idParams = z.object({ id: z.string().min(1, "Falta el id.") });
const updateBody = z
  .object({
    roleId: z.string().min(1).nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    name: z.string().trim().max(120).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

usersRouter.get(
  "/",
  rateLimit({ scope: "public:user:list", limit: 120 }),
  requireCapability("user:read"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await service.listUsers() });
  }),
);

usersRouter.get(
  "/:id",
  rateLimit({ scope: "public:user:get", limit: 120 }),
  requireCapability("user:read"),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const item = await service.getUserById((req.params as { id: string }).id);
    if (!item) throw notFound("Usuario no encontrado.");
    res.json({ item });
  }),
);

usersRouter.patch(
  "/:id",
  rateLimit({ scope: "public:user:edit", limit: 60 }),
  requireCapability("user:edit"),
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const input = req.body as z.infer<typeof updateBody>;

    // Anti-lockout: no te quites el rol ni te desactives a ti mismo.
    if (id === req.user!.id) {
      if (input.status === "disabled") throw badRequest("No puedes desactivar tu propia cuenta.");
      if (input.roleId === null) throw badRequest("No puedes quitarte tu propio rol.");
    }

    const item = await service.updateUser(id, input);
    if (!item) throw notFound("Usuario no encontrado.");
    await writeAudit(req, {
      action: "user.edit",
      targetType: "user",
      targetId: id,
      metadata: { fields: Object.keys(input) },
    });
    res.json({ item });
  }),
);

usersRouter.delete(
  "/:id",
  rateLimit({ scope: "public:user:delete", limit: 60 }),
  requireCapability("user:delete"),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const id = (req.params as { id: string }).id;
    if (id === req.user!.id) throw badRequest("No puedes desactivar tu propia cuenta.");
    const ok = await service.deactivateUser(id);
    if (!ok) throw notFound("Usuario no encontrado.");
    await writeAudit(req, { action: "user.delete", targetType: "user", targetId: id });
    res.json({ ok: true });
  }),
);
