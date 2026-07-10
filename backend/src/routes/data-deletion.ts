/**
 * /api/data-deletion — recibe una solicitud de eliminación de datos.
 *
 * POST público → rateLimit (estricto: limit 3) + requireHuman (Turnstile) +
 * validate(zod). Persiste el HASH de IP (hashIp), nunca la IP cruda.
 * Contrato de salida { ok, id, message }.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, validate } from "@/middleware";
import { hashIp } from "@/lib/client-ip";
import { serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/data-deletion";

export const dataDeletionRouter = Router();

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
  details: z
    .string()
    .trim()
    .max(2000, "Los detalles no pueden exceder 2000 caracteres.")
    .optional(),
  turnstileToken: z.string().optional(),
});

/**
 * @swagger
 * /api/data-deletion:
 *   post:
 *     tags: [system]
 *     summary: Recibe una solicitud de eliminación de datos (rate-limited)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               details: { type: string }
 *     responses:
 *       200:
 *         description: Solicitud recibida
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
 *         description: Demasiadas solicitudes (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo guardar la solicitud
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
dataDeletionRouter.post(
  "/",
  rateLimit({ scope: "data-deletion", limit: 3 }),
  requireHuman, // Cloudflare Turnstile: evita spam automatizado
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    try {
      const result = await service.createDeletionRequest({
        name: body.name,
        email: body.email,
        details: body.details,
        ipHash: hashIp(req),
      });
      res.status(200).json({
        ok: true,
        id: result.id,
        message:
          "Solicitud recibida. Te contactaremos para procesar la eliminación de tus datos.",
      });
    } catch {
      throw serviceUnavailable("No se pudo guardar la solicitud.");
    }
  }),
);
