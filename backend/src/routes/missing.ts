/**
 * ============================================================================
 * Routes de personas desaparecidas. Sigue el patrón canónico del backend:
 *   route (HTTP + middleware) → service (lógica/DB) → db.
 * El route NO habla con la DB directo; toda la lógica vive en services/missing.ts.
 * ============================================================================
 *
 * Reglas aplicadas:
 *  - Lecturas públicas polleadas: rateLimit generoso + cached() (colapsa el
 *    polling) + jsonWithEtag (304) + Cache-Control. MISMO contrato que el Next.
 *  - Mutaciones públicas: rateLimit + requireHuman (Turnstile) + validate(zod).
 *  - Mutaciones admin: requireAdmin (DELETE, restore).
 *  - found: NO es totalmente público (anti-tampering). Mantiene rateLimit +
 *    requireHuman al mínimo (el Next previo solo tenía rate-limit de 2/min; aquí
 *    AÑADIMOS Turnstile además del rate-limit, por el audit de manipulación).
 *  - Fotos: solo se expone la URL derivada /api/missing/:id/photo; la columna
 *    `photo` (base64 o URL R2) jamás se serializa.
 *  - Errores vía throw de @/lib/errors → errorHandler central.
 */
import { Router, json } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, requireAdmin, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { cached } from "@/lib/cache";
import { badRequest, payloadTooLarge, notFound, serviceUnavailable } from "@/lib/errors";
import { HttpError } from "@/lib/errors";
import { writeAudit } from "@/auth/audit";
import * as service from "@/services/missing";

export const missingRouter = Router();

// --- Constantes de validación (espejan el contrato previo) ---
const MAX_NAME = service.MAX_NAME;
const MAX_NATIONALITY = service.MAX_NATIONALITY;
const MAX_PHOTO_CHARS = service.MAX_PHOTO_CHARS;
const MAX_RESOLUTION_NOTE = service.MAX_RESOLUTION_NOTE;
const MIN_SEARCH_LEN = service.MIN_SEARCH_LEN;
const DEFAULT_PAGE_SIZE = service.DEFAULT_PAGE_SIZE;
const MAX_PAGE_SIZE = service.MAX_PAGE_SIZE;

// --- Esquemas zod (validación de entrada, reemplaza el parseo manual) ---
const listQuery = z.object({
  status: z.enum(["active", "found", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(200).optional(),
});

const createBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Indica el nombre de la persona desaparecida.")
    .max(MAX_NAME, `El nombre no puede superar ${MAX_NAME} caracteres.`),
  age: z.union([z.number(), z.string(), z.null()]).optional(),
  nationality: z
    .string()
    .trim()
    .max(MAX_NATIONALITY, `La nacionalidad no puede superar ${MAX_NATIONALITY} caracteres.`)
    .optional(),
  description: z.string().max(600).optional(),
  lastSeen: z.string().max(200).optional(),
  contact: z.string().max(120).optional(),
  photo: z
    .string()
    .max(MAX_PHOTO_CHARS, "La foto es demasiado grande. Usa una imagen más liviana.")
    .nullable()
    .optional(),
  reportType: z.enum(["missing", "found"]).default("missing"),
  // Turnstile lo consume requireHuman; lo permitimos en el body sin reflejarlo.
  turnstileToken: z.string().optional(),
});

const idParams = z.object({ id: z.string().min(1, "Falta el id") });

const foundBody = z.object({
  note: z.string().max(MAX_RESOLUTION_NOTE, "La explicación es demasiado larga.").optional(),
  photo: z.string().max(MAX_PHOTO_CHARS, "La imagen es demasiado grande.").nullable().optional(),
  turnstileToken: z.string().optional(),
});

const mapQuery = z.object({
  north: z.coerce.number().finite().min(-90).max(90).optional(),
  south: z.coerce.number().finite().min(-90).max(90).optional(),
  east: z.coerce.number().finite().min(-180).max(180).optional(),
  west: z.coerce.number().finite().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

// Cache headers (idénticos al endpoint previo).
const LIST_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=15" };
const SEARCH_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" };
const MAP_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=15" };
const STATS_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30" };
const PHOTO_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

// Parser de body para los endpoints que aceptan foto en base64 (~1.4 MB). El
// parser global del server (256kb) es muy chico para estos; lo subimos solo
// aquí (equivale a BODY_LIMIT_PHOTO del app Next previo). El límite EXACTO de
// caracteres de la foto lo aplica validate(zod) después.
const photoJson = json({ limit: "2mb" });

// ---- GET /api/missing : lista paginada (pública, cacheada, con ETag) --------
missingRouter.get(
  "/",
  rateLimit({ scope: "missing:list", limit: 120 }), // generoso: es lectura polleada
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize, q } = req.query as unknown as z.infer<typeof listQuery>;
    const search = q;
    // Una búsqueda efectiva necesita >= MIN_SEARCH_LEN caracteres; por debajo se
    // trata como listado normal (TTL corto). Mismo criterio que el Next previo.
    const hasSearch = (search ?? "").trim().length >= MIN_SEARCH_LEN;
    const key = `missing:${status}:${page}:${pageSize}:${search ?? ""}`;
    const result = await cached(key, hasSearch ? 30_000 : 2_000, () =>
      service.listMissingPage({ status, page, pageSize, search }),
    );
    jsonWithEtag(
      req,
      res,
      {
        people: result.people, // service ya devuelve DTOs (allowlist), no filas crudas
        total: result.total,
        totalCapped: result.totalCapped,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        // El backend SIEMPRE corre con DATABASE_URL (validado en config/env), así
        // que la persistencia está garantizada (equivale a isPersistent()===true).
        persistent: true,
      },
      hasSearch ? SEARCH_CACHE : LIST_CACHE,
    );
  }),
);

// ---- POST /api/missing : crear reporte (PÚBLICO → rate-limit + Turnstile) ---
missingRouter.post(
  "/",
  photoJson,
  rateLimit({ scope: "missing:create", limit: 10 }),
  requireHuman, // Cloudflare Turnstile: solo humanos crean (mata el spam tipo "PRUEBA")
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    if (body.photo) {
      if (!service.isValidPhotoDataUrl(body.photo)) {
        throw badRequest("La foto debe ser una imagen JPG, PNG o WebP válida.");
      }
      if (body.photo.length > MAX_PHOTO_CHARS) {
        throw payloadTooLarge("La foto es demasiado grande. Usa una imagen más liviana.");
      }
    }
    try {
      const person = await service.addMissing({
        name: body.name,
        age: body.age,
        nationality: body.nationality,
        description: body.description,
        lastSeen: body.lastSeen,
        contact: body.contact,
        photo: body.photo,
        reportType: body.reportType,
      });
      res.status(201).json({ person }); // person ya es DTO
    } catch {
      throw serviceUnavailable(
        "No se pudo guardar el reporte. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }),
);

// ---- GET /api/missing/map : marcadores del mapa (pública, cacheada) ---------
missingRouter.get(
  "/map",
  rateLimit({ scope: "missing:map", limit: 120 }),
  validate({ query: mapQuery }),
  asyncHandler(async (req, res) => {
    const { north, south, east, west, limit: limitRaw } = req.query as unknown as z.infer<
      typeof mapQuery
    >;
    const limit = limitRaw ?? 500;
    // Clave por viewport: el caso sin viewport (vista completa) cachea perfecto.
    const key = `missing-map:${north ?? ""}:${south ?? ""}:${east ?? ""}:${west ?? ""}:${limit}`;
    const markers = await cached(key, 3_000, () =>
      service.listMissingMapMarkers({ north, south, east, west, limit }),
    );
    jsonWithEtag(req, res, { markers }, MAP_CACHE);
  }),
);

// ---- GET /api/missing/stats : conteos agregados (pública, cacheada) ---------
missingRouter.get(
  "/stats",
  rateLimit({ scope: "missing:stats", limit: 120 }),
  asyncHandler(async (req, res) => {
    const stats = await cached("missing:stats", 5_000, () => service.countMissingStats());
    jsonWithEtag(req, res, { stats }, STATS_CACHE);
  }),
);

// ---- GET /api/missing/:id/photo : sirve bytes o redirige al origen ----------
missingRouter.get(
  "/:id/photo",
  rateLimit({ scope: "missing:photo", limit: 240 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const photo = await service.getMissingPhoto(id);
    if (!photo) throw notFound("Foto no encontrada.");
    if ("redirectTo" in photo) {
      res.redirect(302, photo.redirectTo);
      return;
    }
    // La foto de una persona no cambia: se cachea de forma agresiva en el CDN.
    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Cache-Control", PHOTO_CACHE);
    res.status(200).end(photo.buffer);
  }),
);

// ---- GET /api/missing/:id/resolution-photo : foto-prueba de la resolución ---
missingRouter.get(
  "/:id/resolution-photo",
  rateLimit({ scope: "missing:resolution-photo", limit: 240 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const photo = await service.getMissingResolutionPhoto(id);
    if (!photo) throw notFound("No se encontró foto de resolución.");
    if ("redirectTo" in photo) {
      res.redirect(302, photo.redirectTo);
      return;
    }
    res.setHeader("Content-Type", photo.contentType);
    res.setHeader("Cache-Control", PHOTO_CACHE);
    res.status(200).end(photo.buffer);
  }),
);

// ---- POST /api/missing/:id/found : marcar localizada -----------------------
// NO es totalmente público (anti-tampering): rate-limit estricto (2/min, igual
// que el Next previo) + Turnstile (AÑADIDO por el audit) + validación zod.
missingRouter.post(
  "/:id/found",
  photoJson,
  rateLimit({ scope: "found", limit: 2 }),
  requireHuman,
  validate({ params: idParams, body: foundBody }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body = req.body as z.infer<typeof foundBody>;

    const note = typeof body.note === "string" ? body.note : "";
    if (!note.trim()) {
      throw badRequest("Cuéntanos cómo te comunicaste o quién confirmó el contacto.");
    }
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw badRequest("La explicación es demasiado larga.");
    }

    const photo = typeof body.photo === "string" ? body.photo : null;
    if (!photo) {
      throw badRequest("Adjunta una captura o foto como prueba del contacto.");
    }
    if (!service.isValidPhotoDataUrl(photo)) {
      throw badRequest("La prueba debe ser una imagen JPG, PNG o WebP válida.");
    }
    if (photo.length > MAX_PHOTO_CHARS) {
      throw payloadTooLarge("La imagen es demasiado grande. Usa una más liviana.");
    }

    try {
      const person = await service.markMissingFound(id, note, photo);
      if (!person) throw notFound("El reporte no existe o ya fue resuelto.");
      res.status(200).json({ person });
    } catch (err) {
      // El notFound (y cualquier HttpError) se propaga tal cual; el resto se
      // enmascara como 503 (no filtrar detalles internos al cliente).
      if (err instanceof HttpError) throw err;
      throw serviceUnavailable("No se pudo actualizar. Inténtalo de nuevo.");
    }
  }),
);

// ---- POST /api/missing/:id/restore : restaurar a activa (ADMIN) ------------
missingRouter.post(
  "/:id/restore",
  rateLimit({ scope: "missing:restore", limit: 30 }), // escritura admin sensible
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const ok = await service.restoreMissing(id);
    if (!ok) throw notFound("No se pudo restaurar (no existe o no estaba marcada).");
    res.status(200).json({ ok: true });
  }),
);

// ---- DELETE /api/missing/:id : eliminar reporte (ADMIN) --------------------
missingRouter.delete(
  "/:id",
  rateLimit({ scope: "missing:delete", limit: 30 }), // escritura admin sensible
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const removed = await service.removeMissing(id);
    if (!removed) throw notFound("No encontrado");
    await writeAudit(req, {
      action: "missing.delete",
      targetType: "missing_person",
      targetId: id,
    });
    res.status(200).json({ ok: true });
  }),
);
