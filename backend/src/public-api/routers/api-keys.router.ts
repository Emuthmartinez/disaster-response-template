/**
 * Router `api/public/api-keys` — gestión self-service de API keys.
 *
 * Self-service: cualquier usuario invitado (cualquier rol con `apikey:manage`,
 * sembrada en todos los roles) crea/lista/revoca SUS PROPIAS llaves.
 *   POST   /            crea (devuelve la llave CRUDA una sola vez)
 *   GET    /            lista TUS llaves (prefijo, nunca la cruda)
 *   DELETE /:id         revoca: la tuya siempre; ajena solo el admin semilla
 *
 * Gateado por `requireCapability("apikey:manage")` (lo exige el ESLint del repo;
 * además permite quitar la potestad a un rol restringido). Cada ruta lleva
 * rateLimit + writeAudit.
 *
 * Anti-escalada: NO se puede gestionar llaves usando una sesión autenticada CON
 * una API key — exige login real (cookie/JWT). Si no, una llave con scope
 * `apikey:manage` podría engendrar más llaves sin un humano.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import * as service from "@/services/api-keys";

export const apiKeysRouter = Router();

const createBody = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la llave.").max(80),
  scopes: z.array(z.string().min(1)).min(1, "Elige al menos un scope."),
  // Epoch-ms futuro, o null/ausente = sin expiración.
  expiresAt: z.number().int().positive().nullable().optional(),
});

const idParams = z.object({ id: z.string().min(1, "Falta el id.") });

/** Rechaza si la sesión actual se autenticó con una API key (no login humano). */
function denyIfApiKeySession(req: { user?: { apiKeyScopes?: string[] } }): void {
  if (req.user?.apiKeyScopes) {
    throw forbidden(
      "Gestiona tus API keys desde una sesión iniciada (no con otra API key).",
    );
  }
}

apiKeysRouter.post(
  "/",
  rateLimit({ scope: "public:apikey:create", limit: 20 }),
  requireCapability("apikey:manage"),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    denyIfApiKeySession(req);
    const body = req.body as z.infer<typeof createBody>;
    if (body.expiresAt != null && body.expiresAt <= Date.now()) {
      throw badRequest("La fecha de expiración debe ser futura.");
    }
    try {
      const { apiKey, rawKey } = await service.createApiKey(req.user!, {
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt ?? null,
      });
      await writeAudit(req, {
        action: "apikey.create",
        targetType: "api_key",
        targetId: apiKey.id,
        metadata: { name: apiKey.name, scopes: apiKey.scopes },
      });
      // La llave cruda SOLO viaja aquí, una vez.
      res.status(201).json({ apiKey, key: rawKey });
    } catch (err) {
      if (err instanceof service.ScopeError) throw badRequest(err.message);
      throw err;
    }
  }),
);

apiKeysRouter.get(
  "/",
  rateLimit({ scope: "public:apikey:list", limit: 120 }),
  requireCapability("apikey:manage"),
  asyncHandler(async (req, res) => {
    res.json({ items: await service.listApiKeysForUser(req.user!.id) });
  }),
);

apiKeysRouter.delete(
  "/:id",
  rateLimit({ scope: "public:apikey:revoke", limit: 60 }),
  requireCapability("apikey:manage"),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    denyIfApiKeySession(req);
    const { id } = req.params as { id: string };
    const key = await service.getApiKeyById(id);
    if (!key) throw notFound("API key no encontrada.");

    // La tuya siempre; ajena solo el admin semilla.
    const isOwner = key.userId === req.user!.id;
    if (!isOwner && !req.user!.isSystemAdmin) {
      throw forbidden("Solo puedes revocar tus propias API keys.");
    }

    await service.revokeApiKey(id, req.user!.id);
    await writeAudit(req, {
      action: "apikey.revoke",
      targetType: "api_key",
      targetId: id,
      metadata: { ownerUserId: key.userId, byAdmin: !isOwner },
    });
    // 200 + JSON (no 204): el cliente del panel parsea el body siempre.
    res.json({ ok: true });
  }),
);
