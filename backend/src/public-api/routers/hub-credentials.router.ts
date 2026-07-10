/**
 * Router `api/public/hub-credentials` — gestión de acceso a la RÉPLICA PÚBLICA
 * (hub SQL, RFC 0006). SOLO super admin.
 *
 *   POST   /                emite: crea rol+password en el hub, abre la IP en el
 *                           firewall y devuelve la conexión UNA sola vez.
 *   POST   /detect-ip       eco de la IP del que llama (para prellenar el form).
 *   GET    /                lista credenciales (sin password).
 *   DELETE /:id             revoca: DROP ROLE + cierra IP + soft-delete.
 *
 * Gateado por `requireCapability("mirror:manage")` — que tiene un corte especial
 * en auth/resolve.ts: exige el flag is_super_admin INCLUSO al admin semilla. Un
 * admin normal recibe 403. Cada ruta lleva rateLimit + writeAudit.
 *
 * Anti-escalada: no se gestiona con una sesión por API key (exige login humano),
 * igual que api-keys.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { forbidden, notFound } from "@/lib/errors";
import { clientIp } from "@/lib/client-ip";
import * as service from "@/services/hub-credentials";

export const hubCredentialsRouter = Router();

// IP o CIDR (v4/v6). Validación laxa de forma; el firewall normaliza a CIDR.
const ipSchema = z
  .string()
  .trim()
  .min(3)
  .max(49)
  .regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, "IP/CIDR inválida.");

const issueBody = z.object({
  consumerName: z.string().trim().min(1, "Ponle un nombre al consumidor.").max(120),
  ip: ipSchema,
});

const idParams = z.object({ id: z.string().min(1, "Falta el id.") });

function denyIfApiKeySession(req: { user?: { apiKeyScopes?: string[] } }): void {
  if (req.user?.apiKeyScopes) {
    throw forbidden("Gestiona la réplica desde una sesión iniciada (no con una API key).");
  }
}

// Eco de la IP del solicitante — para que el super admin prellene el form con la
// IP del consumidor que está al teléfono, sin teclear CIDRs a mano.
hubCredentialsRouter.post(
  "/detect-ip",
  rateLimit({ scope: "public:hubcred:detect", limit: 60 }),
  requireCapability("mirror:manage"),
  asyncHandler(async (req, res) => {
    res.json({ ip: clientIp(req) });
  }),
);

hubCredentialsRouter.post(
  "/",
  rateLimit({ scope: "public:hubcred:issue", limit: 20 }),
  requireCapability("mirror:manage"),
  validate({ body: issueBody }),
  asyncHandler(async (req, res) => {
    denyIfApiKeySession(req);
    const body = req.body as z.infer<typeof issueBody>;
    const issued = await service.issueCredential(req.user!.id, {
      consumerName: body.consumerName,
      ip: body.ip,
    });
    await writeAudit(req, {
      action: "hubcred.issue",
      targetType: "hub_credential",
      targetId: issued.credential.id,
      metadata: {
        consumerName: issued.credential.consumerName,
        pgRole: issued.credential.pgRole,
        allowedIp: issued.credential.allowedIp,
      },
    });
    // La password SOLO viaja aquí, una vez.
    res.status(201).json(issued);
  }),
);

hubCredentialsRouter.get(
  "/",
  rateLimit({ scope: "public:hubcred:list", limit: 120 }),
  requireCapability("mirror:manage"),
  asyncHandler(async (_req, res) => {
    res.json({ items: await service.listCredentials() });
  }),
);

hubCredentialsRouter.delete(
  "/:id",
  rateLimit({ scope: "public:hubcred:revoke", limit: 60 }),
  requireCapability("mirror:manage"),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    denyIfApiKeySession(req);
    const { id } = req.params as { id: string };
    const cred = await service.getCredentialById(id);
    if (!cred) throw notFound("Credencial no encontrada.");

    await service.revokeCredential(id, req.user!.id);
    await writeAudit(req, {
      action: "hubcred.revoke",
      targetType: "hub_credential",
      targetId: id,
      metadata: { pgRole: cred.pgRole, allowedIp: cred.allowedIp },
    });
    res.json({ ok: true });
  }),
);
