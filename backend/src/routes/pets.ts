/**
 * ============================================================================
 * Routes de mascotas desaparecidas/encontradas. Espejo del contrato de
 * `routes/missing.ts`: route (HTTP + middleware) → service (lógica/DB) → db.
 * El route NO habla con la DB directo; todo vive en services/pets.ts.
 * ============================================================================
 *
 * Mismas reglas que personas:
 *  - Lecturas públicas polleadas: rateLimit generoso + cached() + jsonWithEtag
 *    (304) + Cache-Control.
 *  - Mutaciones públicas: rateLimit + requireHuman (Turnstile) + validate(zod).
 *  - Mutaciones admin: requireAdmin (DELETE, restore).
 *  - Fotos: solo se expone /api/pets/:id/photo; la columna `photo` (base64 o URL
 *    de R2) jamás se serializa. El microchip TAMPOCO: el DTO solo dice si hay.
 *  - Errores vía throw de @/lib/errors → errorHandler central.
 *
 * NOTA DE MONTAJE: este router es 100% aditivo. No comparte tabla ni consulta
 * con `/api/missing`, así que desplegarlo no puede alterar el conteo ni el
 * listado de personas desaparecidas — esa garantía es estructural, no una
 * cláusula WHERE que alguien deba recordar.
 */
import { Router, json } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireHuman, requireAdmin, setPublicPhotoHeaders, validate } from "@/middleware";
import { jsonWithEtag } from "@/lib/http";
import { cached } from "@/lib/cache";
import { badRequest, payloadTooLarge, notFound, serviceUnavailable } from "@/lib/errors";
import { HttpError } from "@/lib/errors";
import { writeAudit } from "@/auth/audit";
import * as service from "@/services/pets";

export const petsRouter = Router();

const MAX_PHOTO_CHARS = service.MAX_PHOTO_CHARS;
const MAX_RESOLUTION_NOTE = service.MAX_RESOLUTION_NOTE;
const MIN_SEARCH_LEN = service.MIN_SEARCH_LEN;
const DEFAULT_PAGE_SIZE = service.DEFAULT_PAGE_SIZE;
const MAX_PAGE_SIZE = service.MAX_PAGE_SIZE;

// --- Esquemas zod ---
const listQuery = z.object({
  status: z.enum(["active", "found", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(200).optional(),
  // Especie libre (no enum): la lista de PET_SPECIES guía la UI, pero el filtro
  // acepta cualquier texto para que "otro: caballo" siga siendo filtrable.
  species: z.string().trim().max(service.MAX_SPECIES).optional(),
});

const createBody = z.object({
  // El nombre NO es obligatorio: quien encuentra un animal casi nunca lo sabe, y
  // exigirlo produciría fichas con "Perro1" en vez de datos útiles.
  name: z.string().trim().max(service.MAX_NAME).optional(),
  species: z.string().trim().max(service.MAX_SPECIES).optional(),
  breed: z.string().trim().max(service.MAX_BREED).optional(),
  color: z.string().trim().max(service.MAX_COLOR).optional(),
  sex: z.string().trim().max(20).nullable().optional(),
  age: z.union([z.number(), z.string(), z.null()]).optional(),
  description: z.string().max(service.MAX_DESCRIPTION).optional(),
  lastSeen: z.string().max(service.MAX_LAST_SEEN).optional(),
  contact: z.string().max(service.MAX_CONTACT).optional(),
  microchip: z.string().trim().max(service.MAX_MICROCHIP).nullable().optional(),
  photo: z
    .string()
    .max(MAX_PHOTO_CHARS, "La foto es demasiado grande. Usa una imagen más liviana.")
    .nullable()
    .optional(),
  reportType: z.enum(["missing", "found"]).default("missing"),
  // Coordenadas opcionales: el cliente geocodifica la zona en el submit. Si no lo
  // consigue, el reporte se guarda igual (sin pin en el mapa). Ver services/pets.ts.
  lat: z.coerce.number().finite().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().finite().min(-180).max(180).nullable().optional(),
  // Turnstile lo consume requireHuman; se permite en el body sin reflejarlo.
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

// Cache headers idénticos a los de personas (mismo patrón de polling).
const LIST_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=15" };
const SEARCH_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" };
const MAP_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=15" };
const STATS_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30" };

// Parser de body para los endpoints con foto base64 (~1.4 MB). El parser global
// del server (256kb) se queda corto; el límite EXACTO lo aplica validate(zod).
const photoJson = json({ limit: "2mb" });

// ---- GET /api/pets : lista paginada (pública, cacheada, con ETag) ----------
petsRouter.get(
  "/",
  rateLimit({ scope: "pets:list", limit: 120 }), // generoso: es lectura polleada
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize, q, species } = req.query as unknown as z.infer<
      typeof listQuery
    >;
    const search = q;
    const hasSearch = (search ?? "").trim().length >= MIN_SEARCH_LEN;
    const key = `pets:${status}:${page}:${pageSize}:${search ?? ""}:${species ?? ""}`;
    const result = await cached(key, hasSearch ? 30_000 : 2_000, () =>
      service.listPetsPage({ status, page, pageSize, search, species }),
    );
    jsonWithEtag(
      req,
      res,
      {
        pets: result.pets, // el service ya devuelve DTOs (allowlist)
        total: result.total,
        totalCapped: result.totalCapped,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        persistent: true,
      },
      hasSearch ? SEARCH_CACHE : LIST_CACHE,
    );
  }),
);

// ---- POST /api/pets : crear reporte (PÚBLICO → rate-limit + Turnstile) -----
petsRouter.post(
  "/",
  photoJson,
  rateLimit({ scope: "pets:create", limit: 10 }),
  requireHuman,
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    // Una ficha sin nombre NI descripción NI foto no ayuda a nadie a reconocer al
    // animal; es ruido en el directorio. Se exige al menos una de las tres.
    if (!body.name?.trim() && !body.description?.trim() && !body.photo) {
      throw badRequest(
        "Añade al menos un nombre, una descripción o una foto para que puedan reconocerla.",
      );
    }
    if (body.photo) {
      if (!service.isValidPhotoDataUrl(body.photo)) {
        throw badRequest("La foto debe ser una imagen JPG, PNG o WebP válida.");
      }
      if (body.photo.length > MAX_PHOTO_CHARS) {
        throw payloadTooLarge("La foto es demasiado grande. Usa una imagen más liviana.");
      }
    }
    try {
      const pet = await service.addPet({
        name: body.name,
        species: body.species,
        breed: body.breed,
        color: body.color,
        sex: body.sex,
        age: body.age,
        description: body.description,
        lastSeen: body.lastSeen,
        contact: body.contact,
        microchip: body.microchip,
        photo: body.photo,
        reportType: body.reportType,
        lat: body.lat,
        lng: body.lng,
      });
      res.status(201).json({ pet });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw serviceUnavailable(
        "No se pudo guardar el reporte. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }),
);

// ---- GET /api/pets/map : marcadores del mapa (pública, cacheada) -----------
petsRouter.get(
  "/map",
  rateLimit({ scope: "pets:map", limit: 120 }),
  validate({ query: mapQuery }),
  asyncHandler(async (req, res) => {
    const { north, south, east, west, limit: limitRaw } = req.query as unknown as z.infer<
      typeof mapQuery
    >;
    const limit = limitRaw ?? 500;
    const key = `pets-map:${north ?? ""}:${south ?? ""}:${east ?? ""}:${west ?? ""}:${limit}`;
    const markers = await cached(key, 3_000, () =>
      service.listPetsMapMarkers({ north, south, east, west, limit }),
    );
    jsonWithEtag(req, res, { markers }, MAP_CACHE);
  }),
);

// ---- GET /api/pets/stats : conteos agregados (pública, cacheada) -----------
petsRouter.get(
  "/stats",
  rateLimit({ scope: "pets:stats", limit: 120 }),
  asyncHandler(async (req, res) => {
    const stats = await cached("pets:stats", 5_000, () => service.countPetStats());
    jsonWithEtag(req, res, { stats }, STATS_CACHE);
  }),
);

// ---- GET /api/pets/:id/photo : sirve los bytes o redirige al origen -------
petsRouter.get(
  "/:id/photo",
  rateLimit({ scope: "pets:photo", limit: 240 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const photo = await service.getPetPhoto(id);
    if (!photo) throw notFound("Foto no encontrada.");
    if ("redirectTo" in photo) {
      res.redirect(302, photo.redirectTo);
      return;
    }
    // La foto de una ficha no cambia: se cachea agresivamente en el CDN.
    setPublicPhotoHeaders(res, photo.contentType);
    res.status(200).end(photo.buffer);
  }),
);

// ---- GET /api/pets/:id/resolution-photo : foto-prueba del reencuentro -----
petsRouter.get(
  "/:id/resolution-photo",
  rateLimit({ scope: "pets:resolution-photo", limit: 240 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const photo = await service.getPetResolutionPhoto(id);
    if (!photo) throw notFound("No se encontró foto de resolución.");
    if ("redirectTo" in photo) {
      res.redirect(302, photo.redirectTo);
      return;
    }
    setPublicPhotoHeaders(res, photo.contentType);
    res.status(200).end(photo.buffer);
  }),
);

// ---- POST /api/pets/:id/found : marcar reunida ----------------------------
// NO es totalmente público (anti-tampering): rate-limit estricto + Turnstile +
// validación zod, igual que el equivalente de personas.
petsRouter.post(
  "/:id/found",
  photoJson,
  rateLimit({ scope: "pets:found", limit: 2 }),
  requireHuman,
  validate({ params: idParams, body: foundBody }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body = req.body as z.infer<typeof foundBody>;

    const note = typeof body.note === "string" ? body.note : "";
    if (!note.trim()) {
      throw badRequest("Cuéntanos cómo apareció o quién la entregó.");
    }
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw badRequest("La explicación es demasiado larga.");
    }

    const photo = typeof body.photo === "string" ? body.photo : null;
    if (!photo) {
      throw badRequest("Adjunta una foto del reencuentro como prueba.");
    }
    if (!service.isValidPhotoDataUrl(photo)) {
      throw badRequest("La prueba debe ser una imagen JPG, PNG o WebP válida.");
    }
    if (photo.length > MAX_PHOTO_CHARS) {
      throw payloadTooLarge("La imagen es demasiado grande. Usa una más liviana.");
    }

    try {
      const pet = await service.markPetFound(id, note, photo);
      if (!pet) throw notFound("El reporte no existe o ya fue resuelto.");
      res.status(200).json({ pet });
    } catch (err) {
      // El notFound (y cualquier HttpError) se propaga tal cual; el resto se
      // enmascara como 503 para no filtrar detalles internos.
      if (err instanceof HttpError) throw err;
      throw serviceUnavailable("No se pudo actualizar. Inténtalo de nuevo.");
    }
  }),
);

// ---- POST /api/pets/:id/restore : restaurar a activa (ADMIN) --------------
petsRouter.post(
  "/:id/restore",
  rateLimit({ scope: "pets:restore", limit: 30 }),
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const ok = await service.restorePet(id);
    if (!ok) throw notFound("No se pudo restaurar (no existe o no estaba marcada).");
    res.status(200).json({ ok: true });
  }),
);

// ---- DELETE /api/pets/:id : eliminar reporte (ADMIN) ----------------------
petsRouter.delete(
  "/:id",
  rateLimit({ scope: "pets:delete", limit: 30 }),
  requireAdmin,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const removed = await service.removePet(id);
    if (!removed) throw notFound("No encontrado");
    await writeAudit(req, {
      action: "pet.delete",
      targetType: "missing_pet",
      targetId: id,
    });
    res.status(200).json({ ok: true });
  }),
);
