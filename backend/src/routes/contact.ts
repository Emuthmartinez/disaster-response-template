/**
 * /api/contact — recibe un mensaje de contacto.
 *
 * POST público → rateLimit (estricto: limit 3) + requireHuman (Turnstile) +
 * validate(zod). El route Next previo NO tenía Turnstile; lo AÑADIMOS aquí
 * (el formulario de contacto es un vector de spam clásico, audit). Persiste el
 * HASH de IP (hashIp), nunca la IP cruda. Contrato de salida
 * { ok, id, message } IDÉNTICO.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, validate } from "@/middleware";
import { hashIp } from "@/lib/client-ip";
import { serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/contact";

export const contactRouter = Router();

// Validación (espeja validateContactInput de lib/contact-inbox.ts).
const createBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre debe tener entre 1 y 80 caracteres.")
    .max(80, "El nombre debe tener entre 1 y 80 caracteres."),
  email: z
    .string()
    .trim()
    .max(120, "Ingresa un correo válido.")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Ingresa un correo válido."),
  subject: z
    .string()
    .trim()
    .min(1, "El asunto debe tener entre 1 y 120 caracteres.")
    .max(120, "El asunto debe tener entre 1 y 120 caracteres."),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje debe tener entre 1 y 2000 caracteres.")
    .max(2000, "El mensaje debe tener entre 1 y 2000 caracteres."),
  turnstileToken: z.string().optional(),
});

/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags: [system]
 *     summary: Recibe un mensaje de contacto (rate-limited)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               subject: { type: string }
 *               message: { type: string }
 *     responses:
 *       200:
 *         description: Mensaje recibido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 id: { type: string }
 *                 message: { type: string }
 *       400:
 *         description: Entrada inválida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Demasiados mensajes (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo guardar el mensaje
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
contactRouter.post(
  "/",
  rateLimit({ scope: "contact", limit: 3 }),
  requireHuman, // Cloudflare Turnstile: el formulario de contacto es vector de spam
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    try {
      const message = await service.createContactMessage({
        name: body.name,
        email: body.email,
        subject: body.subject,
        message: body.message,
        ipHash: hashIp(req),
      });
      res.status(200).json({
        ok: true,
        id: message.id,
        message: "Mensaje recibido. Te responderemos pronto.",
      });
    } catch {
      throw serviceUnavailable("No se pudo guardar el mensaje.");
    }
  }),
);
