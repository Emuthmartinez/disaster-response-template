/**
 * Hospitales + pacientes + insumos. Sigue el patrón canónico (ver routes/missing.ts):
 *   route (HTTP + middleware) → service (lógica/DB) → db.
 *
 * Protecciones por endpoint (preserva las del Next route + audit):
 *  - GET (lista/detalle/pacientes/insumos): PÚBLICO polleado → rateLimit generoso
 *    + cached (micro-caché en proceso) + jsonWithEtag (304) + Cache-Control. Mismo
 *    contrato JSON que las rutas Next previas.
 *  - POST /  y POST /:id/patients: PÚBLICO → rateLimit + requireHuman (Turnstile)
 *    + validate(zod). (El Next previo solo tenía rate-limit; el audit pide captcha
 *    en writes públicos para matar el spam de bots.)
 *  - DELETE /:id/patients/:patientId: ADMIN → requireAdmin.
 *  - Writes de insumos (status/needs/help): requireSupplyWrite (admin o POC del
 *    hospital), portado de lib/supply-auth.ts. El middleware resuelve el hospital
 *    (404 si no existe) y lo deja en res.locals.hospital.
 *
 * Salida SIEMPRE por DTO del service (allowlist) — nunca filas crudas; las notas
 * restringidas solo salen en las respuestas de write donde el caller ya está
 * autorizado (idéntico al Next previo: devuelve result.value restringido).
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, requireHuman, validate } from "@/middleware";
import { requireSupplyWrite } from "@/middleware/supply-auth";
import { jsonWithEtag } from "@/lib/http";
import { cached, invalidate } from "@/lib/cache";
import { badRequest, notFound, serviceUnavailable } from "@/lib/errors";
import * as service from "@/services/hospitals";
import type {
  Hospital,
  PublicHospitalSupplyNeed,
  HospitalSupplyCategory,
  HospitalSupplyStatus,
} from "@/services/hospitals";
import {
  publishNeedByAddress,
  type NeedCategory,
  type Priority,
} from "@/modules/needs";

export const hospitalsRouter = Router();

const { MAX_HOSPITAL_NAME, MAX_PATIENT_NAME } = service;

// --- Cache headers (idénticos a los Next routes) ---
const LIST_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=60",
};
const DETAIL_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120",
};
const SUPPLY_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=60",
};
const PATIENT_CACHE = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
};

// --- Esquemas zod ---
const listQuery = z.object({
  include: z.string().optional(),
  zone: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  state: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const createHospitalBody = z.object({
  name: z.string().trim().min(1, "Indica el nombre del hospital.").max(MAX_HOSPITAL_NAME, `El nombre no puede superar ${MAX_HOSPITAL_NAME} caracteres.`),
  facilityType: z
    .enum([
      "hospital",
      "hospital_ivss",
      "hospital_militar",
      "hospital_pediatrico",
      "maternidad",
      "cdi",
      "refugio",
    ])
    .optional(),
  state: z.string().trim().min(1, "Indica el estado del hospital."),
  municipality: z.string().optional(),
  address: z.string().optional(),
  level: z.enum(["I", "II", "III", "IV", "militar"]).nullable().optional(),
  priorityZone: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  turnstileToken: z.string().optional(),
});

const createPatientBody = z.object({
  name: z.string().trim().min(1, "Indica el nombre del paciente.").max(MAX_PATIENT_NAME, `El nombre no puede superar ${MAX_PATIENT_NAME} caracteres.`),
  age: z.union([z.number(), z.string(), z.null()]).optional(),
  condition: z
    .enum(["stable", "serious", "critical", "recovering", "unknown"])
    .optional(),
  status: z
    .enum(["hospitalized", "sheltered", "discharged", "transferred", "deceased"])
    .optional(),
  notes: z.string().optional(),
  contact: z.string().optional(),
  turnstileToken: z.string().optional(),
});

// Los bodies de insumos son permisivos: la normalización/validación fina vive en
// el service (validateSupply*), que ya devuelve mensajes accionables. zod aquí
// solo evita payloads no-objeto.
const supplyStatusBody = z.object({}).passthrough();
const supplyNeedBody = z.object({}).passthrough();
const supplyHelpBody = z.object({}).passthrough();

const idParams = z.object({ id: z.string().min(1) });

// ===========================================================================
// GET /api/hospitals  — lista + (opcional) estados
// ===========================================================================
hospitalsRouter.get(
  "/",
  rateLimit({ scope: "hospitals:list", limit: 120 }),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { include, zone, state, q, limit } = req.query as unknown as z.infer<typeof listQuery>;
    const wantsStates = include === "states";
    const effLimit = Number.isFinite(limit) ? (limit as number) : 50;
    const key = `hospitals:${state ?? ""}:${zone ?? ""}:${q ?? ""}:${effLimit}:${wantsStates ? 1 : 0}`;

    const { hospitals, states } = await cached(key, 10_000, async () => {
      const [hospitals, states] = await Promise.all([
        service.listHospitals({
          state,
          priorityZone: zone,
          search: q,
          limit: effLimit,
          includeSupplySummary: true,
        }),
        wantsStates ? service.listStates() : Promise.resolve(null),
      ]);
      return { hospitals, states };
    });

    jsonWithEtag(req, res, { hospitals, states }, LIST_CACHE);
  }),
);

// ===========================================================================
// POST /api/hospitals  — PÚBLICO (rateLimit + Turnstile + zod)
// ===========================================================================
hospitalsRouter.post(
  "/",
  rateLimit({ scope: "hospitals:create", limit: 6 }),
  requireHuman,
  validate({ body: createHospitalBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createHospitalBody>;
    try {
      const hospital = await service.addHospital({
        name: body.name,
        facilityType: body.facilityType,
        state: body.state,
        municipality: body.municipality,
        address: body.address,
        level: body.level ?? null,
        priorityZone: body.priorityZone,
      });
      invalidate();
      res.status(201).json({ hospital });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo guardar el hospital: ${message}`);
    }
  }),
);

// ===========================================================================
// GET /api/hospitals/:id  — detalle (público, cacheado)
// ===========================================================================
hospitalsRouter.get(
  "/:id",
  rateLimit({ scope: "hospitals:detail", limit: 120 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const hospital = await cached(`hospital:${id}`, 30_000, () =>
      service.getHospital(id, { includeSupplySummary: true }),
    );
    if (!hospital) {
      for (const [k, v] of Object.entries(DETAIL_CACHE)) res.setHeader(k, v);
      res.status(404).json({ error: "Hospital no encontrado." });
      return;
    }
    jsonWithEtag(req, res, { hospital }, DETAIL_CACHE);
  }),
);

// ===========================================================================
// GET /api/hospitals/:id/patients  — lista pacientes (+ hospital)
// ===========================================================================
hospitalsRouter.get(
  "/:id/patients",
  rateLimit({ scope: "hospitals:patients:list", limit: 120 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const hospital = await service.getHospital(id);
    if (!hospital) throw notFound("Hospital no encontrado.");
    const patients = await cached(`hospital:${hospital.id}:patients`, 5_000, async () =>
      (await service.listPatients(hospital.id)).map(service.toPublicPatient),
    );
    jsonWithEtag(req, res, { patients, hospital }, PATIENT_CACHE);
  }),
);

// ===========================================================================
// POST /api/hospitals/:id/patients  — PÚBLICO (rateLimit + Turnstile + zod)
// ===========================================================================
hospitalsRouter.post(
  "/:id/patients",
  rateLimit({ scope: "hospitals:patients:create", limit: 5 }),
  requireHuman,
  validate({ params: idParams, body: createPatientBody }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const hospital = await service.getHospital(id);
    if (!hospital) throw notFound("Hospital no encontrado.");

    const body = req.body as z.infer<typeof createPatientBody>;
    try {
      const patient = await service.addPatient(hospital.id, {
        name: body.name,
        age: body.age,
        condition: body.condition,
        status: body.status,
        notes: body.notes,
        contact: body.contact,
      });
      invalidate();
      res.status(201).json({ patient: service.toPublicPatient(patient) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo guardar el paciente: ${message}`);
    }
  }),
);

// ===========================================================================
// DELETE /api/hospitals/:id/patients/:patientId  — ADMIN
// ===========================================================================
hospitalsRouter.delete(
  "/:id/patients/:patientId",
  rateLimit({ scope: "hospitals:patients:delete", limit: 30 }),
  requireAdmin,
  validate({ params: z.object({ id: z.string().min(1), patientId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const { id, patientId } = req.params as { id: string; patientId: string };
    const hospital = await service.getHospital(id);
    if (!hospital) throw notFound("Hospital no encontrado.");
    const ok = await service.deletePatient(hospital.id, patientId);
    if (!ok) throw notFound("Paciente no encontrado.");
    invalidate();
    res.json({ ok: true });
  }),
);

// ===========================================================================
// GET /api/hospitals/:id/supplies  — estado público de insumos (cacheado)
// ===========================================================================
hospitalsRouter.get(
  "/:id/supplies",
  rateLimit({ scope: "hospitals:supplies:read", limit: 120 }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const hospital = await service.getHospital(id);
    if (!hospital) {
      for (const [k, v] of Object.entries(SUPPLY_CACHE)) res.setHeader(k, v);
      res.status(404).json({ error: "Hospital no encontrado." });
      return;
    }
    const supply = await cached(`hsupply:${hospital.id}`, 10_000, () =>
      service.getPublicHospitalSupplySummary(hospital.id),
    );
    jsonWithEtag(req, res, { hospital, supply }, SUPPLY_CACHE);
  }),
);

// Helper: hospital resuelto por requireSupplyWrite (siempre presente tras el mw).
function locHospital(res: { locals: Record<string, unknown> }): Hospital {
  return res.locals.hospital as Hospital;
}

// Mapeo de categorías/urgencia de insumos de hospital → modelo de ResponseGrid.
const HOSPITAL_CATEGORY_TO_NEED: Record<HospitalSupplyCategory, NeedCategory> = {
  medications: "medicines",
  iv_fluids: "medical_supplies",
  medical_supplies: "medical_supplies",
  soft_foods: "food",
  water: "water",
  beds_capacity: "medical_equipment",
  lab_diagnostics: "medical_supplies",
  transport: "other",
  other: "other",
};
const HOSPITAL_URGENCY_TO_PRIORITY: Record<HospitalSupplyStatus, Priority> = {
  red: "urgent",
  yellow: "high",
  unknown: "medium",
  green: "low",
};

/**
 * Espeja una necesidad de insumos del hospital como necesidad pública en
 * ResponseGrid. El hospital no guarda coordenadas, así que el backend geocodifica
 * su dirección. Best-effort: no afecta al flujo del hospital.
 */
function mirrorHospitalNeed(
  hospital: Hospital,
  need: PublicHospitalSupplyNeed,
): void {
  const address = [hospital.address, hospital.municipality, hospital.state]
    .filter(Boolean)
    .join(", ");
  if (!address) return; // sin dirección no se puede geocodificar
  void publishNeedByAddress({
    title: `${hospital.name}: ${need.itemType}`.slice(0, 140),
    priority: HOSPITAL_URGENCY_TO_PRIORITY[need.urgency],
    address,
    items: [
      {
        name: need.itemType.slice(0, 120),
        quantity: Math.max(1, need.quantity ?? 1),
        unit: need.unit.trim() || null,
        category: HOSPITAL_CATEGORY_TO_NEED[need.category],
      },
    ],
    description:
      need.publicNote.trim() ||
      `Necesidad de insumos del hospital ${hospital.name} (${hospital.state}).`,
  });
}

// ===========================================================================
// POST /api/hospitals/:id/supplies  — upsert semáforo (admin o POC)
// ===========================================================================
hospitalsRouter.post(
  "/:id/supplies",
  rateLimit({ scope: "hospitals:supplies:write", limit: 60 }),
  validate({ params: idParams, body: supplyStatusBody }),
  requireSupplyWrite,
  asyncHandler(async (req, res) => {
    const hospital = locHospital(res);
    try {
      const result = await service.upsertHospitalSupplyStatus(hospital.id, req.body);
      if (!result.ok) throw badRequest(result.error);
      invalidate();
      const supply = await service.getPublicHospitalSupplySummary(hospital.id);
      res.json({ status: result.value, supply });
    } catch (err) {
      if (err instanceof Error && "status" in err) throw err;
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo guardar el estado de insumos: ${message}`);
    }
  }),
);

// ===========================================================================
// POST /api/hospitals/:id/supplies/needs  — crear necesidad (admin o POC)
// ===========================================================================
hospitalsRouter.post(
  "/:id/supplies/needs",
  rateLimit({ scope: "hospitals:supplies:write", limit: 60 }),
  validate({ params: idParams, body: supplyNeedBody }),
  requireSupplyWrite,
  asyncHandler(async (req, res) => {
    const hospital = locHospital(res);
    try {
      const result = await service.createHospitalSupplyNeed(hospital.id, req.body);
      if (!result.ok) throw badRequest(result.error);
      invalidate();
      const supply = await service.getPublicHospitalSupplySummary(hospital.id);
      res.status(201).json({ need: result.value, supply });
      // Espejo fire-and-forget a ResponseGrid (no afecta la respuesta del hospital).
      mirrorHospitalNeed(hospital, result.value);
    } catch (err) {
      if (err instanceof Error && "status" in err) throw err;
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo guardar la necesidad: ${message}`);
    }
  }),
);

// ===========================================================================
// PATCH /api/hospitals/:id/supplies/needs/:needId  — actualizar necesidad
// ===========================================================================
hospitalsRouter.patch(
  "/:id/supplies/needs/:needId",
  rateLimit({ scope: "hospitals:supplies:write", limit: 60 }),
  validate({
    params: z.object({ id: z.string().min(1), needId: z.string().min(1) }),
    body: supplyNeedBody,
  }),
  requireSupplyWrite,
  asyncHandler(async (req, res) => {
    const hospital = locHospital(res);
    const { needId } = req.params as { needId: string };
    try {
      const result = await service.updateHospitalSupplyNeed(hospital.id, needId, req.body);
      if (!result.ok) throw badRequest(result.error);
      if (!result.value) throw notFound("Necesidad no encontrada.");
      invalidate();
      res.json({ need: result.value });
    } catch (err) {
      if (err instanceof Error && "status" in err) throw err;
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo actualizar la necesidad: ${message}`);
    }
  }),
);

// ===========================================================================
// POST /api/hospitals/:id/supplies/help  — crear solicitud de ayuda
// ===========================================================================
hospitalsRouter.post(
  "/:id/supplies/help",
  rateLimit({ scope: "hospitals:supplies:write", limit: 60 }),
  validate({ params: idParams, body: supplyHelpBody }),
  requireSupplyWrite,
  asyncHandler(async (req, res) => {
    const hospital = locHospital(res);
    try {
      const result = await service.createHospitalSupplyHelpRequest(hospital.id, req.body);
      if (!result.ok) throw badRequest(result.error);
      invalidate();
      res.status(201).json({ request: result.value });
    } catch (err) {
      if (err instanceof Error && "status" in err) throw err;
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo guardar la solicitud: ${message}`);
    }
  }),
);

// ===========================================================================
// PATCH /api/hospitals/:id/supplies/help/:requestId  — actualizar solicitud
// ===========================================================================
hospitalsRouter.patch(
  "/:id/supplies/help/:requestId",
  rateLimit({ scope: "hospitals:supplies:write", limit: 60 }),
  validate({
    params: z.object({ id: z.string().min(1), requestId: z.string().min(1) }),
    body: supplyHelpBody,
  }),
  requireSupplyWrite,
  asyncHandler(async (req, res) => {
    const hospital = locHospital(res);
    const { requestId } = req.params as { requestId: string };
    try {
      const result = await service.updateHospitalSupplyHelpRequest(
        hospital.id,
        requestId,
        req.body,
      );
      if (!result.ok) throw badRequest(result.error);
      if (!result.value) throw notFound("Solicitud no encontrada.");
      invalidate();
      res.json({ request: result.value });
    } catch (err) {
      if (err instanceof Error && "status" in err) throw err;
      const message = err instanceof Error ? err.message : "Error desconocido";
      throw serviceUnavailable(`No se pudo actualizar la solicitud: ${message}`);
    }
  }),
);