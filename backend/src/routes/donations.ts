/**
 * /api/donations — estadísticas + registro de intención de donación.
 *
 * GET  público (cacheado, ETag). POST público → rateLimit + requireHuman
 * (Turnstile) + validate(zod). El POST persiste el HASH de IP (hashIp), nunca la
 * IP cruda. Contrato de salida IDÉNTICO al route Next previo.
 *
 * Los fallos de DB se devuelven como error: un cero inventado sería indistinguible
 * de una campaña sin donaciones y podría quedar cacheado por el CDN.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { hashIp } from "@/lib/client-ip";
import { serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/donations";

export const donationsRouter = Router();

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
};

// Validación del POST (espeja validateDonationInput de lib/donation-shared.ts).
const createBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre debe tener entre 1 y 40 caracteres.")
    .max(40, "El nombre debe tener entre 1 y 40 caracteres."),
  amountCents: z.coerce
    .number({ invalid_type_error: "El monto debe ser un número entero en centavos." })
    .int("El monto debe ser un número entero en centavos.")
    .min(
      service.MIN_DONATION_CENTS,
      `El monto debe estar entre USD ${service.MIN_DONATION_CENTS / 100} y USD ${service.MAX_DONATION_CENTS / 100}.`,
    )
    .max(
      service.MAX_DONATION_CENTS,
      `El monto debe estar entre USD ${service.MIN_DONATION_CENTS / 100} y USD ${service.MAX_DONATION_CENTS / 100}.`,
    ),
  turnstileToken: z.string().optional(),
});

/**
 * @swagger
 * /api/donations:
 *   get:
 *     tags: [donations]
 *     summary: Obtiene estadísticas de donaciones y donaciones recientes
 *     responses:
 *       200:
 *         description: Estadísticas globales, meta mensual y últimas donaciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   $ref: '#/components/schemas/DonationStats'
 *                 monthly:
 *                   type: object
 *                   properties:
 *                     raisedCents: { type: integer }
 *                     goalCents: { type: integer }
 *                 recent:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Donation'
 *   post:
 *     tags: [donations]
 *     summary: Registra una intención de donación y devuelve la URL de PayPal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               amountCents: { type: integer }
 *     responses:
 *       200:
 *         description: Donación registrada con su id y URL de pago
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 paypalUrl: { type: string }
 *       400:
 *         description: Datos de donación inválidos
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Demasiadas peticiones (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo registrar la donación
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
donationsRouter.get(
  "/",
  rateLimit({ scope: "donations:list", limit: 120 }), // lectura polleada (banner)
  asyncHandler(async (req, res) => {
    try {
      const [stats, monthly, recent] = await Promise.all([
        service.getDonationStats(),
        service.getMonthlyDonationStats(),
        service.listRecentDonations(30),
      ]);
      jsonWithEtag(req, res, { stats, monthly, recent }, CACHE_HEADERS);
    } catch {
      throw serviceUnavailable("No se pudieron consultar las donaciones.");
    }
  }),
);

donationsRouter.post(
  "/",
  rateLimit({ scope: "donations:create", limit: 5 }),
  requireHuman, // Cloudflare Turnstile: solo humanos registran donaciones
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    try {
      const donation = await service.recordDonation({
        name: body.name,
        amountCents: body.amountCents,
        ipHash: hashIp(req),
        userAgent: req.headers["user-agent"] ?? null,
      });
      res.status(200).json({
        id: donation.id,
        paypalUrl: service.PAYPAL_DONATION_URL,
      });
    } catch {
      throw serviceUnavailable("No se pudo registrar la donación.");
    }
  }),
);
