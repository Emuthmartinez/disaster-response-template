/**
 * /api/patients/search — búsqueda pública de pacientes hospitalizados.
 *
 * Lectura pública: rateLimit (frena enumeración/scraping) + jsonWithEtag (304) +
 * Cache-Control. SIEMPRE publicSafe=true → solo busca por nombre (no por
 * notas/contacto/cédula) para que un caller anónimo no enumere por cédula o
 * teléfono parcial (audit C-1). Contrato de salida { results, query, hasMore }
 * IDÉNTICO al route Next previo.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { cached } from "@/lib/cache";
import * as service from "@/services/patients";

export const patientsRouter = Router();

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
};

const searchQuery = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

/**
 * @swagger
 * /api/patients/search:
 *   get:
 *     tags: [hospitals]
 *     summary: Busca pacientes por nombre
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema: { type: string }
 *         description: Texto de búsqueda
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 500, default: 50 }
 *         description: Máximo de resultados (se acota entre 1 y 500)
 *     responses:
 *       200:
 *         description: Resultados de la búsqueda de pacientes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Paciente público sin notas restringidas y su hospital
 *                 query: { type: string }
 *                 hasMore: { type: boolean }
 *       429:
 *         description: Demasiadas peticiones (rate limit)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
patientsRouter.get(
  "/search",
  rateLimit({ scope: "patsearch", limit: 30 }),
  validate({ query: searchQuery }),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as z.infer<typeof searchQuery>;
    const rows = await cached(`patients:search:${q}:${limit}`, 5_000, () =>
      service.searchPatients(q, limit + 1, { publicSafe: true }),
    );
    const hasMore = limit < 500 && rows.length > limit;
    const results = rows.slice(0, limit);
    jsonWithEtag(req, res, { results, query: q, hasMore }, CACHE_HEADERS);
  }),
);
