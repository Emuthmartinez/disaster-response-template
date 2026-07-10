/**
 * Routes de reportes de emergencia. Sigue el patrón canónico (ver
 * routes/missing.ts): route = HTTP + middleware; la lógica/DB vive en
 * services/reports.ts. Contrato de respuesta IDÉNTICO a las rutas Next previas
 * (app/api/reports/**), el frontend no cambia.
 *
 * Seguridad por ruta:
 *  - GET /            : lectura pública polleada → rateLimit generoso + ETag + cache.
 *  - POST /           : escritura pública → rateLimit + requireHuman (Turnstile) + zod.
 *                       (El endpoint Next previo NO tenía Turnstile; se añade aquí
 *                        para matar el spam de bots, como en POST /api/missing.)
 *  - DELETE /:id      : mutación de admin → requireAdmin (+ rateLimit).
 *  - POST /:id/confirm: confirmación pública → rateLimit generoso + dedup por hashIp.
 *  - GET /:id/photo   : sirve bytes o redirige a R2 (sin ETag JSON; es binario).
 */
import { Router } from "express";
import express from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, requireHuman, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { hashIp } from "@/lib/client-ip";
import { badRequest, HttpError, notFound, payloadTooLarge, serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/reports";
import { publishNeedAtLocation } from "@/modules/needs";

export const reportsRouter = Router();

// --- Cache headers (idénticos al endpoint Next previo) ---
const LIST_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=4, stale-while-revalidate=30",
};

// --- Esquemas zod (validación de entrada; reemplaza el parseo manual) ---
const createBody = z.object({
  type: z.enum(service.REPORT_TYPE_KEYS as [string, ...string[]], {
    errorMap: () => ({ message: "Selecciona el tipo de marcador." }),
  }),
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  place: z.string().trim().min(1, "Indica el nombre o dirección del lugar.").max(200),
  affected: z.union([z.number(), z.string()]).optional(),
  needs: z.string().max(1000).optional(),
  photo: z.string().max(service.MAX_REPORT_PHOTO_CHARS, "La foto es demasiado grande.").nullable().optional(),
  // Turnstile lo consume requireHuman; lo permitimos sin reflejarlo en la salida.
  turnstileToken: z.string().optional(),
});

const idParam = z.object({ id: z.string().min(1, "Falta el id") });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(service.MAX_REPORT_PAGE_SIZE)
    .default(service.DEFAULT_REPORT_PAGE_SIZE),
});

// Parser de JSON con límite ampliado para la foto base64 (~1.4 MB). El parser
// global del server es de 256kb; los reportes con foto necesitan más.
const jsonPhoto = express.json({ limit: "2mb" });

/**
 * Espeja un reporte de suministros como necesidad pública en ResponseGrid. El
 * reporte ya trae coordenadas (no se geocodifica). El texto libre `needs` va como
 * un único artículo de categoría "other". Best-effort: no afecta al reporte.
 */
function mirrorSuppliesReportToNeed(body: z.infer<typeof createBody>): void {
  const needsText = (typeof body.needs === "string" ? body.needs : "").trim();
  const affected = Number(body.affected) || 0;
  void publishNeedAtLocation({
    title: (needsText || `Suministros en ${body.place}`).slice(0, 140),
    priority: "high",
    address: body.place,
    latitude: body.lat,
    longitude: body.lng,
    items: [
      {
        name: (needsText || "Suministros varios").slice(0, 120),
        quantity: 1,
        unit: null,
        category: "other",
      },
    ],
    description:
      affected > 0
        ? `Reporte ciudadano del mapa. Personas afectadas (estimado): ${affected}.`
        : "Reporte ciudadano del mapa.",
  });
}

// ---- GET /api/reports : lista pública (cacheada, con ETag) ------------------
reportsRouter.get(
  "/",
  rateLimit({ scope: "reports:list", limit: 120 }), // generoso: lectura polleada
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as z.infer<typeof listQuery>;
    const result = await service.listReportsPage(page, pageSize);
    jsonWithEtag(req, res, { ...result, persistent: service.isPersistent() }, LIST_CACHE);
  }),
);

// ---- POST /api/reports : crear (PÚBLICO → rate-limit + Turnstile + zod) -----
reportsRouter.post(
  "/",
  jsonPhoto,
  rateLimit({ scope: "reports:create", limit: 20 }),
  requireHuman, // Cloudflare Turnstile: solo humanos crean
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    if (body.photo) {
      if (!service.isValidPhotoDataUrl(body.photo)) {
        throw badRequest("La foto debe ser una imagen JPG, PNG o WebP válida.");
      }
      if (body.photo.length > service.MAX_REPORT_PHOTO_CHARS) {
        throw payloadTooLarge("La foto es demasiado grande. Usa una imagen más liviana.");
      }
    }
    try {
      const report = await service.addReport({
        type: body.type as service.ReportType,
        lat: body.lat,
        lng: body.lng,
        place: body.place,
        affected: Number(body.affected) || 0,
        needs: typeof body.needs === "string" ? body.needs : "",
        photo: body.photo ?? null,
      });
      res.status(201).json({ report }); // report ya es DTO
      // Espejo fire-and-forget tras responder: no bloquea ni afecta al reporte.
      if (body.type === "supplies") mirrorSuppliesReportToNeed(body);
    } catch {
      // Falla visible: nunca confirmamos un reporte que no se guardó en la base.
      throw serviceUnavailable(
        "No se pudo guardar el reporte. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }),
);

// ---- DELETE /api/reports/:id : marcar como atendido (ADMIN) -----------------
reportsRouter.delete(
  "/:id",
  requireAdmin,
  rateLimit({ scope: "reports:delete", limit: 60 }),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const removed = await service.removeReport(id);
    if (!removed) throw notFound("No encontrado");
    res.json({ ok: true });
  }),
);

// ---- POST /api/reports/:id/confirm : confirmar (PÚBLICO, dedup por hashIp) --
// eslint-disable-next-line local/user-facing-mutation-needs-guard -- confirmación anónima por diseño: protegida por rateLimit + dedup por hashIp, sin login.
reportsRouter.post(
  "/:id/confirm",
  rateLimit({ scope: "reports:confirm", limit: 60 }), // generoso: confirmar es barato
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParam>;
    try {
      // Dedup por hash de IP (no IP cruda); contexto humanitario.
      const result = await service.confirmReport(id, hashIp(req));
      if (result.status === "not-found") throw notFound("No encontrado");
      if (result.status === "duplicate") {
        res.status(409).json({ ok: false, error: "Ya confirmaste este reporte." });
        return;
      }
      res.json({ ok: true, confirmations: result.confirmations });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw serviceUnavailable("No se pudo confirmar. Intenta de nuevo.");
    }
  }),
);

// ---- GET /api/reports/:id/photo : bytes o redirección a R2 ------------------
reportsRouter.get(
  "/:id/photo",
  rateLimit({ scope: "reports:photo", limit: 240 }),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const photo = await service.getReportPhoto(id);
    if (!photo) {
      res.status(404).type("text/plain").send("No encontrada");
      return;
    }
    // Foto migrada a R2: redirigimos al CDN en vez de servir bytes.
    if ("redirectTo" in photo) {
      res.redirect(302, photo.redirectTo);
      return;
    }
    // La foto de un reporte no cambia: caché agresiva.
    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.send(photo.buffer);
  }),
);
