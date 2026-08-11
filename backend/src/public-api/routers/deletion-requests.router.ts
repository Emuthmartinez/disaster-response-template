/**
 * Router `api/public/deletion-requests` — gestión de solicitudes de
 * eliminación de datos personales para el panel admin. La ENTRADA ciudadana
 * vive aparte (POST /api/data-deletion, pública, sin auth); aquí solo la
 * operación del canal por parte de un operador con capability:
 *
 *   GET   /       (deletion:read)  lista (PII de solicitantes — por eso la
 *                                   lectura tiene su propia capacidad, aparte
 *                                   de la de resolver)
 *   PATCH /:id    (deletion:edit)  resolver / rechazar / reabrir
 *
 * "Eliminación de datos" es intencionalmente genérico: qué norma legal exige
 * este flujo depende de la jurisdicción del despliegue (GDPR en la UE, CCPA en
 * California, Ley 1581 de 2012 en Colombia, u otra) — el código no debe atarse
 * a una sola. Documenta la que aplique a tu despliegue en tu propio runbook.
 *
 * Escrito a mano (dos claves, no el cuarteto CRUD read/create/edit/delete de la
 * fábrica). CONTRATO del endpoint de lista: el body es `{ items: [...] }`, NO
 * un array desnudo — es la forma que produce `createCrudRouter` para todo
 * modelo de la fábrica, y el gateway genérico de modelos del panel admin
 * (`admin/src/contexts/models/*`) asume esa forma para CUALQUIER router que
 * registre en el listado, incluidos los escritos a mano como este. Devolver un
 * array desnudo aquí rompe la pantalla del panel con un 502 silencioso (solo lo
 * atrapa un E2E, ningún test unitario) sin que el router en sí falle. Cualquier
 * router hecho a mano que alimente `models/*` debe seguir esta misma regla.
 *
 * Todas las rutas: rateLimit + requireCapability; la mutación además
 * writeAudit (gates que exige la regla ESLint local/user-facing-mutation-needs-guard).
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { notFound } from "@/lib/errors";
import {
  DELETION_REQUEST_STATUSES,
  listDeletionRequests,
  updateDeletionRequestStatus,
} from "@/services/data-deletion";

export const deletionRequestsRouter = Router();

const idParams = z.object({ id: z.string().min(1, "Falta el id.") });
const patchBody = z.object({
  status: z.enum(DELETION_REQUEST_STATUSES),
});

deletionRequestsRouter.get(
  "/",
  rateLimit({ scope: "public:deletion:list", limit: 120 }),
  requireCapability("deletion:read"),
  asyncHandler(async (_req, res) => {
    // Envelope {items} — ver nota de contrato en la cabecera del fichero.
    res.json({ items: await listDeletionRequests() });
  }),
);

deletionRequestsRouter.patch(
  "/:id",
  rateLimit({ scope: "public:deletion:edit", limit: 60 }),
  requireCapability("deletion:edit"),
  validate({ params: idParams, body: patchBody }),
  asyncHandler(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const { status } = req.body as z.infer<typeof patchBody>;
    const item = await updateDeletionRequestStatus(id, status);
    if (!item) throw notFound("Solicitud no encontrada.");
    await writeAudit(req, {
      action: "deletion-request.edit",
      targetType: "deletion-request",
      targetId: id,
      metadata: { status },
    });
    res.json({ item });
  }),
);
