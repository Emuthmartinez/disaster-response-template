/**
 * Sincronización de fuentes externas. El trabajo pesado NO corre inline (audit
 * M-2): los handlers ENCOLAN y devuelven 202 {jobIds}; el admin consulta estado
 * con GET /api/sync/status. Mismo contrato que app/api/sync/* del app Next.
 *
 * Auth: run/reset/duplicates/status → requireAdmin; cron/geocode → requireCron.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, requireCron, validate } from "@/middleware";
import { badRequest, serviceUnavailable } from "@/lib/errors";
import { getSyncJobState, getMaintenanceJobState, enqueueGeocode, enqueueDuplicatesReport, type SyncMode } from "@/lib/queues";
import * as service from "@/services/sync";

export const syncRouter = Router();

const NO_STORE = { "Cache-Control": "no-store" };

const runQuery = z.object({
  dryRun: z.enum(["1", "true"]).optional(),
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).optional(),
  mode: z.enum(["chunk"]).optional(),
  pages: z.coerce.number().int().min(1).optional(),
  status: z.enum(["found", "missing"]).optional(),
});

/**
 * @swagger
 * /api/sync/run:
 *   post:
 *     tags: [sync]
 *     summary: Dispara manualmente la sincronización de fuentes externas (requiere x-admin-token)
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         schema: { type: string, enum: ['1', 'true'] }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [chunk] }
 *       - in: query
 *         name: pages
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       202:
 *         description: Corrida ENCOLADA. Estado vía GET /api/sync/status?jobId=.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 queued: { type: boolean }
 *                 jobIds: { type: array, items: { type: string } }
 *       400:
 *         description: Fuente desconocida.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudo encolar (cola no disponible).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.post(
  "/run",
  rateLimit({ scope: "sync:run", limit: 10 }),
  requireAdmin,
  validate({ query: runQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof runQuery>;
    const dryRun = q.dryRun === "1" || q.dryRun === "true";
    const mode: SyncMode = q.mode === "chunk" ? "chunk" : "full";
    if (q.source && !service.isKnownSource(q.source)) {
      throw badRequest(`Fuente desconocida: ${q.source}`);
    }
    try {
      const jobIds = await service.runSync({
        source: q.source ?? null,
        mode,
        dryRun,
        limit: q.limit,
        pagesPerRun: q.pages,
        statusFilter: q.status,
      });
      res.status(202).set(NO_STORE).json({ ok: true, queued: true, jobIds });
    } catch (err) {
      throw serviceUnavailable(err instanceof Error ? err.message : "No se pudo encolar.");
    }
  }),
);

const resetQuery = z.object({ source: z.string().optional() });

/**
 * @swagger
 * /api/sync/reset:
 *   post:
 *     tags: [sync]
 *     summary: Reinicia el cursor de sincronización (admin). No destructivo.
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cursor reiniciado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       500:
 *         description: Error al reiniciar el cursor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.post(
  "/reset",
  rateLimit({ scope: "sync:reset", limit: 30 }),
  requireAdmin,
  validate({ query: resetQuery }),
  asyncHandler(async (req, res) => {
    const { source } = req.query as unknown as z.infer<typeof resetQuery>;
    try {
      await service.resetSyncCursor(source);
      res.set(NO_STORE).json({ ok: true });
    } catch (err) {
      // Mismo status que el route previo (500) en fallo de cursor.
      res.status(500).set(NO_STORE).json({
        error: err instanceof Error ? err.message : "Error al reiniciar el cursor.",
      });
    }
  }),
);

const dupsQuery = z.object({
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

/**
 * @swagger
 * /api/sync/duplicates:
 *   post:
 *     tags: [sync]
 *     summary: Encola el reporte de posibles duplicados (requiere x-admin-token)
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       202:
 *         description: Reporte encolado. Lee el resultado con GET /api/sync/status?jobId=.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 queued: { type: boolean }
 *                 jobId: { type: string }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudo encolar.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.post(
  "/duplicates",
  rateLimit({ scope: "sync:duplicates", limit: 10 }),
  requireAdmin,
  validate({ query: dupsQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof dupsQuery>;
    try {
      const jobId = await enqueueDuplicatesReport(q.source, q.limit);
      res.status(202).set(NO_STORE).json({ ok: true, queued: true, jobId });
    } catch (err) {
      throw serviceUnavailable(err instanceof Error ? err.message : "No se pudo encolar.");
    }
  }),
);

const statusQuery = z.object({ jobId: z.string().min(1, "Falta el parámetro jobId.") });

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     tags: [sync]
 *     summary: Estado de un job de sync encolado (status-poll, requiere x-admin-token)
 *     parameters:
 *       - in: query
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estado + resultado del job.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId: { type: string }
 *                 state: { type: string }
 *                 progress: {}
 *                 result: {}
 *                 failedReason: { type: string, nullable: true }
 *       400:
 *         description: Falta jobId.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       404:
 *         description: Job no encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.get(
  "/status",
  rateLimit({ scope: "sync:status", limit: 120 }),
  requireAdmin,
  validate({ query: statusQuery }),
  asyncHandler(async (req, res) => {
    const { jobId } = req.query as unknown as z.infer<typeof statusQuery>;
    // El jobId trae prefijo de su cola (sync-* / maint-*); consultamos la que
    // corresponde, con la otra como respaldo.
    const state = jobId.startsWith("maint-")
      ? (await getMaintenanceJobState(jobId)) ?? (await getSyncJobState(jobId))
      : (await getSyncJobState(jobId)) ?? (await getMaintenanceJobState(jobId));
    if (!state) {
      res.status(404).set(NO_STORE).json({ error: "Job no encontrado." });
      return;
    }
    res.set(NO_STORE).json(state);
  }),
);

/**
 * @swagger
 * /api/sync/cron:
 *   get:
 *     tags: [sync]
 *     summary: Dispara el cron de sincronización (Auth Bearer CRON_SECRET o admin)
 *     responses:
 *       202:
 *         description: Sync encolado (un job chunked por fuente). Estado vía /api/sync/status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 queued: { type: boolean }
 *                 jobIds: { type: array, items: { type: string } }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudo encolar.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.get(
  "/cron",
  rateLimit({ scope: "sync:cron", limit: 30 }),
  requireCron,
  asyncHandler(async (_req, res) => {
    try {
      const jobIds = await service.runCron();
      res.status(202).set(NO_STORE).json({ ok: true, queued: true, jobIds });
    } catch (err) {
      throw serviceUnavailable(err instanceof Error ? err.message : "No se pudo encolar.");
    }
  }),
);

const geocodeQuery = z.object({ max: z.coerce.number().int().min(1).optional() });

/**
 * @swagger
 * /api/sync/geocode:
 *   get:
 *     tags: [sync]
 *     summary: Geocodifica un lote de ubicaciones sin coordenadas (cron, Auth Bearer CRON_SECRET o admin)
 *     parameters:
 *       - in: query
 *         name: max
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       202:
 *         description: Geocode encolado. Estado vía GET /api/sync/status?jobId=.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 queued: { type: boolean }
 *                 jobId: { type: string }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudo encolar.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
syncRouter.get(
  "/geocode",
  rateLimit({ scope: "sync:geocode", limit: 30 }),
  requireCron,
  validate({ query: geocodeQuery }),
  asyncHandler(async (req, res) => {
    const { max } = req.query as unknown as z.infer<typeof geocodeQuery>;
    try {
      const jobId = await enqueueGeocode(max);
      res.status(202).set(NO_STORE).json({ ok: true, queued: true, jobId });
    } catch (err) {
      throw serviceUnavailable(err instanceof Error ? err.message : "No se pudo encolar.");
    }
  }),
);
