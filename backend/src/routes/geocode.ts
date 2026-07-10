/**
 * /api/geocode — geocodificación de direcciones vía Nominatim (región
 * configurable, ver GEOCODE_COUNTRY_CODES en src/services/geocode.ts).
 *
 * Lectura pública: rateLimit (frena abuso del proxy a Nominatim) + Cache-Control
 * largo (las direcciones no cambian). Con q < 3 chars devuelve { results: [] }
 * SIN consumir rate-limit ni golpear Nominatim (igual que el Next previo).
 * Contrato de salida { results: [{lat,lng,label}] } IDÉNTICO.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import * as service from "@/services/geocode";

export const geocodeRouter = Router();

const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
};

const geocodeQuery = z.object({
  q: z.string().default(""),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/**
 * @swagger
 * /api/geocode:
 *   get:
 *     tags: [system]
 *     summary: Geocodifica una dirección vía Nominatim (con sesgo opcional)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 3 }
 *         description: Texto a buscar. Con menos de 3 caracteres devuelve lista vacía.
 *       - in: query
 *         name: lat
 *         required: false
 *         schema: { type: number }
 *         description: Latitud de referencia para priorizar resultados cercanos.
 *       - in: query
 *         name: lng
 *         required: false
 *         schema: { type: number }
 *         description: Longitud de referencia para priorizar resultados cercanos.
 *     responses:
 *       200:
 *         description: Resultados de geocodificación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       lat: { type: number }
 *                       lng: { type: number }
 *                       label: { type: string }
 *       429:
 *         description: Límite de búsquedas excedido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Error al consultar el servicio de geocodificación.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
geocodeRouter.get(
  "/",
  validate({ query: geocodeQuery }),
  // El short-circuit de q<3 va ANTES del rate-limit (igual que el Next previo):
  // las búsquedas vacías/cortas no consumen cuota ni golpean Nominatim.
  ((req, res, next) => {
    const { q } = req.query as unknown as z.infer<typeof geocodeQuery>;
    if ((q ?? "").trim().length < 3) {
      res.status(200).json({ results: [] });
      return;
    }
    next();
  }) as RequestHandler,
  // Rate-limit SOLO cuando hay búsqueda real (q>=3), igual que el Next previo.
  rateLimit({ scope: "geo:search", limit: 30 }),
  asyncHandler(async (req, res) => {
    const { q, lat, lng } = req.query as unknown as z.infer<typeof geocodeQuery>;
    const query = (q ?? "").trim();
    const bias =
      lat !== undefined && lng !== undefined ? { lat, lng } : null;
    const results = await service.geocode(query, bias);
    for (const [k, v] of Object.entries(CACHE_HEADERS)) res.setHeader(k, v);
    res.status(200).json({ results });
  }),
);
