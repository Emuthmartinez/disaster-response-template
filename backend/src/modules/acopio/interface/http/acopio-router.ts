import { Router } from "express";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import type { ListCollectionCenters } from "../../application/list-collection-centers";
import {
  listCollectionCentersQuery,
  makeListCollectionCentersHandler,
} from "./acopio-controller";

/**
 * @swagger
 * /api/acopio:
 *   get:
 *     tags: [system]
 *     summary: Centros de acopio verificados (proxy de ResponseGrid)
 *     description: >-
 *       Devuelve los puntos donde se reciben donaciones físicas, con facetas de
 *       país y categoría para filtrar. Los datos provienen de ResponseGrid y se
 *       cachean en el backend.
 *     parameters:
 *       - in: query
 *         name: country
 *         required: false
 *         schema: { type: string }
 *         description: Filtra por país (valor exacto de las facetas, p.ej. "Ruritania").
 *       - in: query
 *         name: category
 *         required: false
 *         schema: { type: string }
 *         description: Filtra por categoría aceptada (p.ej. "food", "water").
 *       - in: query
 *         name: q
 *         required: false
 *         schema: { type: string }
 *         description: Búsqueda de texto (nombre, organización, dirección, ciudad).
 *     responses:
 *       200:
 *         description: Lista filtrada + facetas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       manager: { type: string, nullable: true }
 *                       address: { type: string, nullable: true }
 *                       city: { type: string, nullable: true }
 *                       country: { type: string, nullable: true }
 *                       lat: { type: number, nullable: true }
 *                       lng: { type: number, nullable: true }
 *                       accepts: { type: array, items: { type: string } }
 *                       contact: { type: string, nullable: true }
 *                       schedule: { type: string, nullable: true }
 *                       status: { type: string }
 *                       verificationLevel: { type: string }
 *                       disputed: { type: boolean }
 *                       description: { type: string, nullable: true }
 *                 total: { type: integer }
 *                 facets:
 *                   type: object
 *                   properties:
 *                     byCountry: { type: object, additionalProperties: { type: integer } }
 *                     byCategory: { type: object, additionalProperties: { type: integer } }
 *       429:
 *         description: Límite de solicitudes excedido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Error al consultar el directorio externo.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export function createAcopioRouter(
  listCollectionCenters: ListCollectionCenters,
): Router {
  const router = Router();
  router.get(
    "/",
    rateLimit({ scope: "acopio:list", limit: 120 }),
    validate({ query: listCollectionCentersQuery }),
    asyncHandler(makeListCollectionCentersHandler(listCollectionCenters)),
  );
  return router;
}
