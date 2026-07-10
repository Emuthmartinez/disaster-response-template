/**
 * Chat ciudadano. Sigue el patrón canónico (ver routes/missing.ts):
 *  - GET /  : lectura pública polleada → rateLimit generoso + jsonWithEtag (304)
 *             + Cache-Control. MISMO contrato que el endpoint Next previo.
 *  - POST / : mutación pública → rateLimit + requireHuman (Turnstile) + validate.
 *             (El Next previo solo tenía rate-limit; el audit exigía captcha en
 *             writes públicos para matar spam de bots.)
 *  - DELETE /:id : mutación admin → requireAdmin (el Next usaba isAdminRequest).
 *
 * El route NO toca la DB: toda la lógica/consultas viven en services/chat.ts.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, requireHuman, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { notFound, serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/chat";

export const chatRouter = Router();

// Cache headers (idénticos al endpoint Next previo).
const LIST_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=20",
};

// --- Esquemas zod (validación de entrada) ---
const listQuery = z.object({
  // Filtro opcional por rol. Roles inválidos se ignoran (= sin filtro), igual
  // que el Next previo (isValidChatRole ? rol : undefined).
  role: z.string().optional(),
});

const createBody = z.object({
  name: z.string().max(service.MAX_NAME).optional(),
  text: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje.")
    .max(service.MAX_TEXT, `El mensaje no puede superar ${service.MAX_TEXT} caracteres.`),
  role: z.string().optional(),
  replyTo: z.string().nullable().optional(),
  // Turnstile lo consume requireHuman; lo permitimos en el body sin reflejarlo.
  turnstileToken: z.string().optional(),
});

const idParam = z.object({ id: z.string().min(1, "Falta el id") });

// ---- GET /api/chat : lista de mensajes por hilo (pública, cacheada, ETag) ----
chatRouter.get(
  "/",
  rateLimit({ scope: "chat:list", limit: 120 }), // generoso: es lectura polleada
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { role } = req.query as unknown as z.infer<typeof listQuery>;
    const roleFilter = role && service.isValidChatRole(role) ? role : undefined;
    const messages = await service.listMessages(roleFilter ? { role: roleFilter } : {});
    jsonWithEtag(
      req,
      res,
      // El backend siempre tiene DB obligatoria → persistent siempre true.
      { messages, persistent: true },
      LIST_CACHE,
    );
  }),
);

// ---- POST /api/chat : crear mensaje (PÚBLICO → rate-limit + Turnstile) -------
chatRouter.post(
  "/",
  rateLimit({ scope: "chat:create", limit: 20 }),
  requireHuman, // Cloudflare Turnstile: solo humanos publican (mata spam de bots)
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    const role = body.role && service.isValidChatRole(body.role) ? body.role : "citizen";
    const replyTo =
      typeof body.replyTo === "string" && body.replyTo.trim() ? body.replyTo.trim() : null;
    try {
      const message = await service.addMessage({
        name: body.name,
        text: body.text,
        role,
        replyTo,
      });
      res.status(201).json({ message }); // message ya es DTO (allowlist)
    } catch {
      throw serviceUnavailable(
        "No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }),
);

// ---- DELETE /api/chat/:id : borrar mensaje (ADMIN) --------------------------
chatRouter.delete(
  "/:id",
  rateLimit({ scope: "chat:delete", limit: 30 }), // write admin sensible
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParam>;
    const removed = await service.removeMessage(id);
    if (!removed) throw notFound("No encontrado");
    res.status(200).json({ ok: true });
  }),
);
