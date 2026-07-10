/**
 * Espejo READ-ONLY del hub federado (otros sitios socios). GET públicos,
 * cacheados con ETag (304 bajo polling), mismo contrato que app/api/hub/* del
 * app Next. Sin PII. Ver patrón de referencia en routes/missing.ts.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import * as service from "@/services/hub";

export const hubRouter = Router();

const REPORTS_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
};
const STATS_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120",
};

const reportsQuery = z.object({
  type: z.enum(["missing_person", "checkin", "help_request", "help_offer", "damaged_building"], {
    errorMap: () => ({
      message: `type requerido y debe ser uno de: ${service.HUB_TYPES.join(", ")}`,
    }),
  }),
  limit: z.coerce.number().int().min(1).max(service.MAX_LIMIT).default(100),
});

/**
 * @swagger
 * /api/hub/reports:
 *   get:
 *     tags: [hub]
 *     summary: Lee el espejo federado del hub central (otros sitios). READ-ONLY, sin PII.
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [missing_person, checkin, help_request, help_offer, damaged_building]
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 200 }
 *     responses:
 *       200:
 *         description: Lista de reportes federados del tipo pedido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type: { type: string }
 *                 count: { type: integer }
 *                 reports: { type: array, items: { type: object } }
 *       400:
 *         description: type inválido o ausente.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
hubRouter.get(
  "/reports",
  rateLimit({ scope: "hub:reports", limit: 120 }),
  validate({ query: reportsQuery }),
  asyncHandler(async (req, res) => {
    const { type, limit } = req.query as unknown as z.infer<typeof reportsQuery>;
    const reports = await service.listHubReports(type, limit);
    jsonWithEtag(req, res, { type, count: reports.length, reports }, REPORTS_CACHE);
  }),
);

/**
 * @swagger
 * /api/hub/stats:
 *   get:
 *     tags: [hub]
 *     summary: Conteos del espejo federado del hub (por tipo + total). Para el panel admin.
 *     responses:
 *       200:
 *         description: Totales de la federación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 byType:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string }
 *                       count: { type: integer }
 *                       photos: { type: integer }
 *                       broken: { type: integer }
 *                       lastIngestedAt: { type: integer, nullable: true }
 */
hubRouter.get(
  "/stats",
  rateLimit({ scope: "hub:stats", limit: 120 }),
  asyncHandler(async (req, res) => {
    const result = await service.getHubStats();
    jsonWithEtag(req, res, result, STATS_CACHE);
  }),
);
