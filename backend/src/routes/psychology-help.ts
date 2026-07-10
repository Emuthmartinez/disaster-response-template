/**
 * /api/stats/psychology-help — contador de clics en "ayuda psicológica".
 *
 * GET público (cacheado, ETag). POST público → rateLimit (sin Turnstile: es un
 * clic de baja sensibilidad, el dedup por IP ya limita el inflado). El dedup
 * persiste el HASH de IP (hashIp), nunca la IP cruda (la columna es ip_hash).
 *
 * El route Next previo usaba clientIp() crudo como clave de dedup; aquí lo
 * hasheamos (hashIp) para no persistir IPs en claro (contexto humanitario).
 * Contrato de salida { count } IDÉNTICO.
 */
import { Router } from "express";
import { asyncHandler, rateLimit } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { hashIp } from "@/lib/client-ip";
import { serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/psychology-help";

export const psychologyHelpRouter = Router();

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
};

/**
 * @swagger
 * /api/stats/psychology-help:
 *   get:
 *     tags: [system]
 *     summary: Devuelve el contador de clics en "ayuda psicológica"
 *     responses:
 *       200:
 *         description: Contador actual de clics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *   post:
 *     tags: [system]
 *     summary: Registra un clic en "ayuda psicológica" (rate-limited por IP)
 *     responses:
 *       200:
 *         description: Clic registrado, devuelve el nuevo contador
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       429:
 *         description: Demasiadas peticiones
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: No se pudo registrar el clic
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
psychologyHelpRouter.get(
  "/",
  rateLimit({ scope: "psychology-help:list", limit: 120 }),
  asyncHandler(async (req, res) => {
    try {
      const count = await service.getPsychologyHelpClickCount();
      jsonWithEtag(req, res, { count }, CACHE_HEADERS);
    } catch {
      throw serviceUnavailable("No se pudo consultar el contador.");
    }
  }),
);

// eslint-disable-next-line local/user-facing-mutation-needs-guard -- contador de clics público y anónimo; protegido solo por rateLimit + dedup por hash de IP, sin humano ni gate por diseño
psychologyHelpRouter.post(
  "/",
  rateLimit({ scope: "psychology-help:click", limit: 20 }),
  asyncHandler(async (req, res) => {
    try {
      const count = await service.incrementPsychologyHelpClick(hashIp(req));
      res.status(200).json({ count });
    } catch {
      throw serviceUnavailable("No se pudo registrar el clic.");
    }
  }),
);
