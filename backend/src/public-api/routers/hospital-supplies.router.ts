/**
 * Router `api/public/hospital-supplies` — superficie operativa de insumos
 * hospitalarios para el panel admin (capability-gated, deny-by-default).
 *
 * Escrito a mano (no fábrica CRUD) porque el recurso es un agregado por
 * hospital (snapshot restringido + escrituras por sub-entidad), no un CRUD
 * plano. Reutiliza las capacidades existentes del modelo hospital — NO
 * introduce claves nuevas (el seed de capacidades corre solo en el job de
 * migración, gateado a humanos):
 *
 *   GET    /                                  (hospital:read)  board completo
 *   GET    /:hospitalId                       (hospital:read)  snapshot de uno
 *   GET    /:hospitalId/events                (hospital:read)  bitácora insumos
 *   POST   /:hospitalId/status                (hospital:edit)  upsert semáforo
 *   POST   /:hospitalId/needs                 (hospital:edit)  crear necesidad
 *   PATCH  /:hospitalId/needs/:needId         (hospital:edit)  editar necesidad
 *   PATCH  /:hospitalId/help/:requestId       (hospital:edit)  resolver ayuda
 *
 * La validación de fondo vive en services/hospitals (misma fuente única que la
 * superficie pública de POCs); el body pasa passthrough y el service devuelve
 * Validation<T>. Todas las rutas: rateLimit + requireCapability + writeAudit
 * en mutaciones (gates que exige el ESLint del repo).
 *
 * A diferencia de routes/hospitals.ts, aquí NO se espeja la necesidad a
 * ResponseGrid: esa publicación pertenece al flujo del POC público; el panel
 * admin edita el estado operativo sin efectos hacia integraciones.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { badRequest, notFound } from "@/lib/errors";
import { invalidate } from "@/lib/cache";
import * as service from "@/services/hospitals";
import type { Hospital, RestrictedHospitalSupplySnapshot } from "@/services/hospitals";

export const hospitalSuppliesRouter = Router();

const hospitalParams = z.object({ hospitalId: z.string().min(1, "Falta el hospital.") });
// El body va passthrough a propósito: la validación canónica (categorías,
// semáforos, clamps y textos seguros) vive en services/hospitals, la misma que
// usa la superficie pública de POCs. No la dupliquemos aquí.
const passthroughBody = z.object({}).passthrough();
const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(service.MAX_SUPPLY_EVENTS_LIMIT).optional(),
});

/** Snapshot vacío para hospitales sin filas de insumos todavía. */
function emptySnapshot(hospitalId: string): RestrictedHospitalSupplySnapshot {
  return {
    hospitalId,
    summary: {
      statuses: [],
      activeNeeds: [],
      counts: { red: 0, yellow: 0, stale: 0, activeNeeds: 0 },
      worstStatus: "unknown",
      lastConfirmedAt: null,
    },
    statuses: [],
    activeNeeds: [],
    helpRequests: [],
    pocs: [],
  };
}

/** 404 si el hospital no existe; si existe lo devuelve (para audit y DTO). */
async function requireHospital(hospitalId: string): Promise<Hospital> {
  const hospital = await service.getHospital(hospitalId);
  if (!hospital) throw notFound("Hospital no encontrado.");
  return hospital;
}

/**
 * Sella actor y origen de la mutación SIN excepción: `updatedBy` es SIEMPRE el
 * email del admin autenticado (cualquier valor del body se descarta — permitir
 * override dejaría forjar la atribución en la bitácora) y `source` distingue
 * esta superficie frente al panel de POCs público. Mismo criterio que los
 * demás routers a mano (users/grants/api-keys): el actor sale de la sesión,
 * nunca del request.
 */
function stampActor(
  body: Record<string, unknown>,
  userEmail: string,
): Record<string, unknown> {
  return { ...body, updatedBy: userEmail, source: "admin_api" };
}

// ---------------------------------------------------------------------------
// GET / — board: todos los hospitales con su snapshot restringido + stats
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.get(
  "/",
  rateLimit({ scope: "public:hospital-supplies:list", limit: 120 }),
  requireCapability("hospital:read"),
  asyncHandler(async (_req, res) => {
    const hospitals = await service.listHospitals({ limit: 1000 });
    const snapshots = await service.listRestrictedSupplySnapshotsForHospitals(
      hospitals.map((hospital) => hospital.id),
    );
    const rows = hospitals.map((hospital) => ({
      hospital,
      supply: snapshots.get(hospital.id) ?? emptySnapshot(hospital.id),
    }));

    let redCategories = 0;
    let yellowCategories = 0;
    let staleCategories = 0;
    let activeNeeds = 0;
    let helpOpen = 0;
    for (const row of rows) {
      redCategories += row.supply.statuses.filter((s) => s.status === "red").length;
      yellowCategories += row.supply.statuses.filter((s) => s.status === "yellow").length;
      staleCategories += row.supply.statuses.filter((s) => s.freshness.isStale).length;
      activeNeeds += row.supply.summary.counts.activeNeeds;
      helpOpen += row.supply.helpRequests.filter((request) =>
        service.isOpenHospitalSupplyHelpStatus(request.status),
      ).length;
    }

    res.json({
      generatedAt: Date.now(),
      stats: {
        hospitals: rows.length,
        redCategories,
        yellowCategories,
        staleCategories,
        activeNeeds,
        helpOpen,
      },
      hospitals: rows,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /:hospitalId — snapshot restringido de un hospital
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.get(
  "/:hospitalId",
  rateLimit({ scope: "public:hospital-supplies:get", limit: 120 }),
  requireCapability("hospital:read"),
  validate({ params: hospitalParams }),
  asyncHandler(async (req, res) => {
    const { hospitalId } = req.params as { hospitalId: string };
    const hospital = await requireHospital(hospitalId);
    const supply = await service.getRestrictedHospitalSupplySnapshot(hospitalId);
    res.json({ hospital, supply });
  }),
);

// ---------------------------------------------------------------------------
// GET /:hospitalId/events — bitácora de insumos (más reciente primero)
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.get(
  "/:hospitalId/events",
  rateLimit({ scope: "public:hospital-supplies:events", limit: 120 }),
  requireCapability("hospital:read"),
  validate({ params: hospitalParams, query: eventsQuery }),
  asyncHandler(async (req, res) => {
    const { hospitalId } = req.params as { hospitalId: string };
    await requireHospital(hospitalId);
    const { limit } = req.query as unknown as { limit?: number };
    res.json({ items: await service.listHospitalSupplyEvents(hospitalId, limit ?? 50) });
  }),
);

// ---------------------------------------------------------------------------
// POST /:hospitalId/status — upsert del semáforo de una categoría
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.post(
  "/:hospitalId/status",
  rateLimit({ scope: "public:hospital-supplies:write", limit: 60 }),
  requireCapability("hospital:edit"),
  validate({ params: hospitalParams, body: passthroughBody }),
  asyncHandler(async (req, res) => {
    const { hospitalId } = req.params as { hospitalId: string };
    await requireHospital(hospitalId);
    const input = stampActor(req.body as Record<string, unknown>, req.user!.email);
    const result = await service.upsertHospitalSupplyStatus(hospitalId, input);
    if (!result.ok) throw badRequest(result.error);
    invalidate();
    await writeAudit(req, {
      action: "hospital.supply.status",
      targetType: "hospital",
      targetId: hospitalId,
      metadata: { category: result.value.category, status: result.value.status },
    });
    res.json({ status: result.value });
  }),
);

// ---------------------------------------------------------------------------
// POST /:hospitalId/needs — crear necesidad de insumos
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.post(
  "/:hospitalId/needs",
  rateLimit({ scope: "public:hospital-supplies:write", limit: 60 }),
  requireCapability("hospital:edit"),
  validate({ params: hospitalParams, body: passthroughBody }),
  asyncHandler(async (req, res) => {
    const { hospitalId } = req.params as { hospitalId: string };
    await requireHospital(hospitalId);
    const input = stampActor(req.body as Record<string, unknown>, req.user!.email);
    const result = await service.createHospitalSupplyNeed(hospitalId, input);
    if (!result.ok) throw badRequest(result.error);
    invalidate();
    await writeAudit(req, {
      action: "hospital.supply.need.create",
      targetType: "hospital",
      targetId: hospitalId,
      metadata: { needId: result.value.id, category: result.value.category },
    });
    res.status(201).json({ need: result.value });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:hospitalId/needs/:needId — editar/cerrar necesidad
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.patch(
  "/:hospitalId/needs/:needId",
  rateLimit({ scope: "public:hospital-supplies:write", limit: 60 }),
  requireCapability("hospital:edit"),
  validate({
    params: hospitalParams.extend({ needId: z.string().min(1, "Falta la necesidad.") }),
    body: passthroughBody,
  }),
  asyncHandler(async (req, res) => {
    const { hospitalId, needId } = req.params as { hospitalId: string; needId: string };
    await requireHospital(hospitalId);
    const input = stampActor(req.body as Record<string, unknown>, req.user!.email);
    const result = await service.updateHospitalSupplyNeed(hospitalId, needId, input);
    if (!result.ok) throw badRequest(result.error);
    if (!result.value) throw notFound("Necesidad no encontrada.");
    invalidate();
    await writeAudit(req, {
      action: "hospital.supply.need.edit",
      targetType: "hospital",
      targetId: hospitalId,
      metadata: { needId, status: result.value.status },
    });
    res.json({ need: result.value });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:hospitalId/help/:requestId — atender solicitud de ayuda
// ---------------------------------------------------------------------------
hospitalSuppliesRouter.patch(
  "/:hospitalId/help/:requestId",
  rateLimit({ scope: "public:hospital-supplies:write", limit: 60 }),
  requireCapability("hospital:edit"),
  validate({
    params: hospitalParams.extend({ requestId: z.string().min(1, "Falta la solicitud.") }),
    body: passthroughBody,
  }),
  asyncHandler(async (req, res) => {
    const { hospitalId, requestId } = req.params as {
      hospitalId: string;
      requestId: string;
    };
    await requireHospital(hospitalId);
    // Las solicitudes de ayuda llevan `requestedBy` (no `updatedBy`); el
    // service lo trata como "quién ejecuta este patch" y lo copia a la
    // bitácora. Igual que stampActor: SIEMPRE la sesión, nunca el body.
    const body = req.body as Record<string, unknown>;
    const input = {
      ...body,
      requestedBy: req.user!.email,
      source: "admin_api",
    };
    const result = await service.updateHospitalSupplyHelpRequest(
      hospitalId,
      requestId,
      input,
    );
    if (!result.ok) throw badRequest(result.error);
    if (!result.value) throw notFound("Solicitud no encontrada.");
    invalidate();
    await writeAudit(req, {
      action: "hospital.supply.help.edit",
      targetType: "hospital",
      targetId: hospitalId,
      metadata: { requestId, status: result.value.status },
    });
    res.json({ request: result.value });
  }),
);
