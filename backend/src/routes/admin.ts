/**
 * Superficie admin. login es PÚBLICO pero anti-brute-force (rateLimit por IP);
 * el resto requiere requireAdmin (header x-admin-token == ADMIN_PASSWORD). Mismo
 * contrato que app/api/admin/* del app Next.
 *
 * Nota de contrato (login): el app previo NO emite un JWT; el "token" de admin ES
 * la contraseña, que el frontend reenvía en x-admin-token. Por eso login solo
 * valida y responde { ok: true } (shape idéntico) — no cambiamos el frontend.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, requireAdmin, validate } from "@/middleware";
import { serviceUnavailable } from "@/lib/errors";
import * as adminSvc from "@/services/admin";
import * as donationsSvc from "@/services/donations";
import * as contactSvc from "@/services/contact";
import * as reportsSvc from "@/services/reports";
import * as chatSvc from "@/services/chat";
import * as missingSvc from "@/services/missing";
import * as syncSvc from "@/services/sync";
import * as hospitalsSvc from "@/services/hospitals";
import type {
  Hospital,
  RestrictedHospitalSupplySnapshot,
} from "@/services/hospitals";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const adminRouter = Router();

const NO_STORE = { "Cache-Control": "no-store" };

const loginBody = z.object({ password: z.string().optional() });
const markReadBody = z.object({ id: z.string().min(1, "Falta id del mensaje.") });

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     tags: [admin]
 *     summary: Inicia sesión de administrador validando la contraseña (limitado por IP)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Contraseña válida.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       401:
 *         description: Contraseña incorrecta.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       429:
 *         description: Demasiados intentos (rate limit por IP).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: Acceso de administrador no configurado en el servidor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// eslint-disable-next-line local/user-facing-mutation-needs-guard -- login admin es público por naturaleza; su protección es rateLimit anti-brute-force
adminRouter.post(
  "/login",
  rateLimit({ scope: "login", limit: 5 }), // anti-brute-force por IP
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    if (!adminSvc.isAdminConfigured()) {
      throw serviceUnavailable(
        "El acceso de administrador no está configurado en el servidor.",
      );
    }
    const { password } = req.body as z.infer<typeof loginBody>;
    if (!adminSvc.isValidAdminPassword(password)) {
      res.status(401).json({ error: "Contraseña incorrecta." });
      return;
    }
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/admin/donations:
 *   get:
 *     tags: [admin]
 *     summary: Lista todas las donaciones con estadísticas (requiere admin)
 *     responses:
 *       200:
 *         description: Estadísticas y listado completo de donaciones.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generatedAt: { type: integer, description: epoch-ms }
 *                 stats: { $ref: '#/components/schemas/DonationStats' }
 *                 donations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Donation' }
 *       401:
 *         description: No autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudieron cargar las donaciones.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
adminRouter.get(
  "/donations",
  rateLimit({ scope: "admin:donations", limit: 120 }),
  requireAdmin,
  asyncHandler(async (_req, res) => {
    try {
      const [stats, donations] = await Promise.all([
        donationsSvc.getDonationStats(),
        donationsSvc.listAllDonations(),
      ]);
      res.set(NO_STORE).json({ generatedAt: Date.now(), stats, donations });
    } catch {
      throw serviceUnavailable("No se pudieron cargar las donaciones.");
    }
  }),
);

/**
 * @swagger
 * /api/admin/contact:
 *   get:
 *     tags: [admin]
 *     summary: Lista mensajes de contacto + estadísticas (requiere admin)
 *     responses:
 *       200: { description: Mensajes y stats. }
 *       401: { description: No autorizado. }
 *       503: { description: No se pudieron cargar los mensajes. }
 *   patch:
 *     tags: [admin]
 *     summary: Marca un mensaje de contacto como leído (requiere admin)
 *     responses:
 *       200: { description: ok. }
 *       400: { description: Falta id. }
 *       404: { description: Mensaje no encontrado. }
 */
adminRouter.get(
  "/contact",
  rateLimit({ scope: "admin:contact", limit: 120 }),
  requireAdmin,
  asyncHandler(async (_req, res) => {
    try {
      const [stats, messages] = await Promise.all([
        contactSvc.getContactStats(),
        contactSvc.listContactMessages(),
      ]);
      res.set(NO_STORE).json({ generatedAt: Date.now(), stats, messages });
    } catch {
      throw serviceUnavailable("No se pudieron cargar los mensajes.");
    }
  }),
);

adminRouter.patch(
  "/contact",
  rateLimit({ scope: "admin:contact:mark-read", limit: 60 }),
  requireAdmin,
  validate({ body: markReadBody }),
  asyncHandler(async (req, res) => {
    const { id } = req.body as z.infer<typeof markReadBody>;
    const ok = await contactSvc.markContactMessageRead(id);
    if (!ok) {
      res.status(404).json({ error: "Mensaje no encontrado." });
      return;
    }
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/admin/data:
 *   get:
 *     tags: [admin]
 *     summary: Panel admin con datos agregados (requiere admin)
 *     responses:
 *       200: { description: Estadísticas y colecciones completas. }
 *       401: { description: No autorizado. }
 */
adminRouter.get(
  "/data",
  rateLimit({ scope: "admin:data", limit: 120 }),
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [reports, messages, people, syncRuns, syncState] = await Promise.all([
      reportsSvc.listReports(),
      chatSvc.listMessages(),
      missingSvc.listMissing({ includeFound: true }),
      syncSvc.listSyncRuns(15),
      syncSvc.listSyncState(),
    ]);
    const now = Date.now();

    const byType = Object.fromEntries(
      reportsSvc.REPORT_TYPE_KEYS.map((k) => [k, 0]),
    ) as Record<string, number>;
    let totalAffected = 0;
    let reportsLastHour = 0;
    let reportsLast24h = 0;
    let reportsWithPhoto = 0;
    for (const report of reports) {
      if (byType[report.type] !== undefined) byType[report.type] = (byType[report.type] ?? 0) + 1;
      totalAffected += report.affected;
      if (now - report.createdAt <= HOUR) reportsLastHour += 1;
      if (now - report.createdAt <= DAY) reportsLast24h += 1;
      if (report.photoUrl) reportsWithPhoto += 1;
    }

    const messagesLastHour = messages.filter((m) => now - m.createdAt <= HOUR).length;
    const peopleWithPhoto = people.filter((p) => p.photoUrl).length;
    const peopleFound = people.filter((p) => p.status === "found").length;
    const peopleActive = people.length - peopleFound;

    res.set(NO_STORE).json({
      generatedAt: now,
      persistent: true,
      stats: {
        reports: {
          total: reports.length,
          byType,
          totalAffected,
          lastHour: reportsLastHour,
          last24h: reportsLast24h,
          withPhoto: reportsWithPhoto,
        },
        chat: { total: messages.length, lastHour: messagesLastHour },
        missing: {
          total: people.length,
          active: peopleActive,
          found: peopleFound,
          withPhoto: peopleWithPhoto,
        },
      },
      reports,
      messages,
      people,
      sync: { runs: syncRuns, state: syncState },
    });
  }),
);

interface AdminHospitalSupplyRow {
  hospital: Hospital;
  supply: RestrictedHospitalSupplySnapshot;
}

/**
 * @swagger
 * /api/admin/hospital-supplies:
 *   get:
 *     tags: [admin]
 *     summary: Superficie operativa de insumos hospitalarios (requiere admin)
 *     responses:
 *       200:
 *         description: Hospitales con estados, necesidades, POCs y solicitudes restringidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generatedAt: { type: integer, description: epoch-ms }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     hospitals: { type: integer }
 *                     redCategories: { type: integer }
 *                     yellowCategories: { type: integer }
 *                     staleCategories: { type: integer }
 *                     activeNeeds: { type: integer }
 *                     helpOpen: { type: integer }
 *                 hospitals:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/AdminHospitalSupplyRow' }
 *       401:
 *         description: No autorizado
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       503:
 *         description: No se pudo cargar la superficie de insumos
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
adminRouter.get(
  "/hospital-supplies",
  rateLimit({ scope: "admin:hospital-supplies", limit: 120 }),
  requireAdmin,
  asyncHandler(async (_req, res) => {
    try {
      const hospitals = await hospitalsSvc.listHospitals({ limit: 1000 });
      const snapshots = await hospitalsSvc.listRestrictedSupplySnapshotsForHospitals(
        hospitals.map((hospital) => hospital.id),
      );
      const rows: AdminHospitalSupplyRow[] = hospitals.map((hospital) => ({
        hospital,
        supply: snapshots.get(hospital.id) ?? {
          hospitalId: hospital.id,
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
        },
      }));

      let redCategories = 0;
      let yellowCategories = 0;
      let staleCategories = 0;
      let activeNeeds = 0;
      let helpOpen = 0;
      for (const row of rows) {
        redCategories += row.supply.statuses.filter((s) => s.status === "red").length;
        yellowCategories += row.supply.statuses.filter(
          (s) => s.status === "yellow",
        ).length;
        staleCategories += row.supply.statuses.filter((s) => s.freshness.isStale).length;
        activeNeeds += row.supply.summary.counts.activeNeeds;
        helpOpen += row.supply.helpRequests.filter((request) =>
          hospitalsSvc.isOpenHospitalSupplyHelpStatus(request.status),
        ).length;
      }

      res.set(NO_STORE).json({
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
    } catch {
      throw serviceUnavailable("No se pudieron cargar los insumos hospitalarios.");
    }
  }),
);
