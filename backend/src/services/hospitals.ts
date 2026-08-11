/**
 * Service de hospitales + pacientes + insumos. La LÓGICA y las consultas viven
 * aquí (no en el route). Portado desde lib/hospitals.ts y lib/hospital-supplies.ts
 * del app Next previo, preservando el SQL y el contrato de salida EXACTOS.
 *
 * Diferencias respecto al lib previo:
 *  - El backend SIEMPRE tiene DB (env exige DATABASE_URL), así que se elimina el
 *    fallback en-memoria/seed-en-runtime del lib previo. El seed de hospitales lo
 *    aplica el Job de migración/seed, no el request path.
 *  - getDb() es async aquí.
 *  - Salida por DTO explícito (mismas formas que el JSON previo).
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const {
  hospitals,
  hospitalPatients,
  hospitalSupplyStatuses,
  hospitalSupplyNeeds,
  hospitalSupplyHelpRequests,
  hospitalPocAssignments,
  hospitalSupplyEvents,
} = schema;

// ============================================================================
// Tipos y constantes (portados de lib/hospitals-meta.ts — solo lo que se usa)
// ============================================================================

export type HospitalPriorityZone = "P0" | "P1" | "P2" | "P3";
export type HospitalFacilityType =
  | "hospital"
  | "hospital_ivss"
  | "hospital_militar"
  | "hospital_pediatrico"
  | "maternidad"
  | "cdi"
  | "refugio";
export type HospitalLevel = "I" | "II" | "III" | "IV" | "militar" | null;
export type PatientStatus =
  | "hospitalized"
  | "sheltered"
  | "discharged"
  | "transferred"
  | "deceased";
export type PatientCondition = "stable" | "serious" | "critical" | "recovering" | "unknown";
export type HospitalSupplyCategory =
  | "medications"
  | "iv_fluids"
  | "medical_supplies"
  | "soft_foods"
  | "water"
  | "beds_capacity"
  | "lab_diagnostics"
  | "transport"
  | "other";
export type HospitalSupplyStatus = "green" | "yellow" | "red" | "unknown";
export type HospitalSupplyNeedStatus =
  | "active"
  | "partially_covered"
  | "covered"
  | "cancelled"
  | "needs_verification";
export type HospitalSupplyHelpStatus = "open" | "contacting" | "resolved" | "closed";

export const MAX_HOSPITAL_NAME = 200;
export const MAX_PATIENT_NAME = 120;
export const MAX_SUPPLY_NOTE = 600;
export const MAX_SUPPLY_ITEM = 120;
export const MAX_SUPPLY_UNIT = 40;
export const MAX_SUPPLY_ACTOR = 120;
export const MAX_SUPPLY_HELP_MESSAGE = 500;

const HOSPITAL_FACILITY_TYPES = new Set<HospitalFacilityType>([
  "hospital",
  "hospital_ivss",
  "hospital_militar",
  "hospital_pediatrico",
  "maternidad",
  "cdi",
  "refugio",
]);
const PRIORITY_ZONES = new Set<HospitalPriorityZone>(["P0", "P1", "P2", "P3"]);
const PATIENT_STATUSES = new Set<PatientStatus>([
  "hospitalized",
  "sheltered",
  "discharged",
  "transferred",
  "deceased",
]);
const PATIENT_CONDITIONS = new Set<PatientCondition>([
  "stable",
  "serious",
  "critical",
  "recovering",
  "unknown",
]);

export const HOSPITAL_SUPPLY_CATEGORIES: HospitalSupplyCategory[] = [
  "medications",
  "iv_fluids",
  "medical_supplies",
  "soft_foods",
  "water",
  "beds_capacity",
  "lab_diagnostics",
  "transport",
  "other",
];
const HOSPITAL_SUPPLY_STATUSES = new Set<HospitalSupplyStatus>([
  "green",
  "yellow",
  "red",
  "unknown",
]);
const HOSPITAL_SUPPLY_NEED_STATUSES = new Set<HospitalSupplyNeedStatus>([
  "active",
  "partially_covered",
  "covered",
  "cancelled",
  "needs_verification",
]);
const HOSPITAL_SUPPLY_HELP_STATUSES = new Set<HospitalSupplyHelpStatus>([
  "open",
  "contacting",
  "resolved",
  "closed",
]);
const ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES = new Set<HospitalSupplyNeedStatus>([
  "active",
  "partially_covered",
  "needs_verification",
]);

interface CategoryMeta {
  label: string;
  staleAfterHours: number;
}
const HOSPITAL_SUPPLY_CATEGORY_META: Record<HospitalSupplyCategory, CategoryMeta> = {
  medications: { label: "Medicamentos", staleAfterHours: 6 },
  iv_fluids: { label: "Líquidos IV / sueros", staleAfterHours: 6 },
  medical_supplies: { label: "Insumos médicos", staleAfterHours: 8 },
  soft_foods: { label: "Alimentos blandos/digeribles", staleAfterHours: 12 },
  water: { label: "Agua", staleAfterHours: 12 },
  beds_capacity: { label: "Camas / capacidad", staleAfterHours: 6 },
  lab_diagnostics: { label: "Laboratorio / diagnóstico", staleAfterHours: 24 },
  transport: { label: "Transporte", staleAfterHours: 12 },
  other: { label: "Otro", staleAfterHours: 12 },
};

// --- slug helpers (portados de lib/hospitals-meta.ts) ---

function slugifyHospitalPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildHospitalSlug(h: { name: string; municipality: string; state: string }): string {
  const parts = [h.name, h.municipality || h.state].filter(Boolean);
  return slugifyHospitalPart(parts.join(" ")) || "hospital";
}

function matchesHospitalSlug(
  h: { name: string; municipality: string; state: string },
  slug: string,
): boolean {
  const normalized = slugifyHospitalPart(slug);
  if (!normalized) return false;
  return (
    normalized === buildHospitalSlug(h) ||
    normalized === slugifyHospitalPart(h.name) ||
    normalized ===
      slugifyHospitalPart([h.name, h.municipality, h.state].filter(Boolean).join(" "))
  );
}

// ============================================================================
// DTOs públicos (allowlist explícita — mismas formas que el JSON Next previo)
// ============================================================================

export interface SupplyFreshness {
  lastUpdatedAt: number;
  lastConfirmedAt: number;
  staleAfterHours: number;
  isStale: boolean;
  updatedAgo: string;
  confirmedAgo: string;
}

export interface PublicHospitalSupplyStatus {
  category: HospitalSupplyCategory;
  status: HospitalSupplyStatus;
  label: string;
  publicNote: string;
  freshness: SupplyFreshness;
}

export interface PublicHospitalSupplyNeed {
  id: string;
  hospitalId: string;
  category: HospitalSupplyCategory;
  categoryLabel: string;
  itemType: string;
  quantity: number | null;
  unit: string;
  urgency: HospitalSupplyStatus;
  status: HospitalSupplyNeedStatus;
  publicNote: string;
  lastConfirmedAt: number;
  updatedAt: number;
  updatedAgo: string;
}

export interface PublicHospitalSupplySummary {
  statuses: PublicHospitalSupplyStatus[];
  activeNeeds: PublicHospitalSupplyNeed[];
  counts: { red: number; yellow: number; stale: number; activeNeeds: number };
  worstStatus: HospitalSupplyStatus;
  lastConfirmedAt: number | null;
}

export interface RestrictedHospitalSupplyStatus extends PublicHospitalSupplyStatus {
  hospitalId: string;
  id: string;
  restrictedNote: string;
  updatedBy: string;
  source: string;
}

export interface RestrictedHospitalSupplyNeed extends PublicHospitalSupplyNeed {
  restrictedNote: string;
  updatedBy: string;
  source: string;
  createdAt: number;
}

export interface HospitalSupplyHelpRequest {
  id: string;
  hospitalId: string;
  category: HospitalSupplyCategory;
  categoryLabel: string;
  message: string;
  urgency: HospitalSupplyStatus;
  status: HospitalSupplyHelpStatus;
  requestedBy: string;
  source: string;
  restrictedNote: string;
  createdAt: number;
  updatedAt: number;
  updatedAgo: string;
}

export interface HospitalPocAssignment {
  id: string;
  hospitalId: string;
  displayName: string;
  role: "operator_admin" | "hospital_poc" | "ops_reader";
  restrictedContact: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RestrictedHospitalSupplySnapshot {
  hospitalId: string;
  summary: PublicHospitalSupplySummary;
  statuses: RestrictedHospitalSupplyStatus[];
  activeNeeds: RestrictedHospitalSupplyNeed[];
  helpRequests: HospitalSupplyHelpRequest[];
  pocs: HospitalPocAssignment[];
}

export function isOpenHospitalSupplyHelpStatus(
  status: HospitalSupplyHelpStatus,
): boolean {
  return status === "open" || status === "contacting";
}

export interface Hospital {
  id: string;
  externalId: string | null;
  name: string;
  facilityType: HospitalFacilityType;
  state: string;
  municipality: string;
  address: string;
  level: HospitalLevel;
  priorityZone: HospitalPriorityZone;
  isPriority: boolean;
  activePatients: number;
  totalPatients: number;
  createdAt: number;
  supplySummary?: PublicHospitalSupplySummary;
}

export interface HospitalPatient {
  id: string;
  hospitalId: string;
  name: string;
  age: number | null;
  condition: PatientCondition;
  status: PatientStatus;
  notes: string;
  contact: string;
  admittedAt: number;
  updatedAt: number;
}

export type PublicHospitalPatient = Omit<HospitalPatient, "notes">;

// ============================================================================
// timeAgo (portado de lib/format.ts — comportamiento exacto)
// ============================================================================

function timeAgo(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "hace menos de un minuto";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

// ============================================================================
// Normalizadores (portados)
// ============================================================================

function normalizeFacilityType(v: string | null | undefined): HospitalFacilityType {
  const t = (v ?? "").toLowerCase();
  return HOSPITAL_FACILITY_TYPES.has(t as HospitalFacilityType)
    ? (t as HospitalFacilityType)
    : "hospital";
}

function normalizePriority(v: string | null | undefined): HospitalPriorityZone {
  const t = (v ?? "P3").toUpperCase();
  return PRIORITY_ZONES.has(t as HospitalPriorityZone)
    ? (t as HospitalPriorityZone)
    : "P3";
}

function normalizeLevel(v: string | null | undefined): HospitalLevel {
  if (!v) return null;
  const t = v.toUpperCase();
  if (t === "I" || t === "II" || t === "III" || t === "IV") return t;
  if (t === "MILITAR") return "militar";
  return null;
}

function normalizeAge(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 130) return null;
  return n;
}

function normalizeSupplyCategory(value: unknown): HospitalSupplyCategory | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[-\s]+/g, "_");
  return HOSPITAL_SUPPLY_CATEGORIES.includes(normalized as HospitalSupplyCategory)
    ? (normalized as HospitalSupplyCategory)
    : null;
}

function normalizeSupplyStatus(value: unknown): HospitalSupplyStatus | null {
  const raw = (typeof value === "string" ? value.trim() : "").toLowerCase();
  return HOSPITAL_SUPPLY_STATUSES.has(raw as HospitalSupplyStatus)
    ? (raw as HospitalSupplyStatus)
    : null;
}

function normalizeNeedStatus(value: unknown): HospitalSupplyNeedStatus | null {
  const raw = (typeof value === "string" ? value.trim() : "").toLowerCase();
  return HOSPITAL_SUPPLY_NEED_STATUSES.has(raw as HospitalSupplyNeedStatus)
    ? (raw as HospitalSupplyNeedStatus)
    : null;
}

function normalizeHelpStatus(value: unknown): HospitalSupplyHelpStatus | null {
  const raw = (typeof value === "string" ? value.trim() : "").toLowerCase();
  return HOSPITAL_SUPPLY_HELP_STATUSES.has(raw as HospitalSupplyHelpStatus)
    ? (raw as HospitalSupplyHelpStatus)
    : null;
}

function normalizeStaleAfterHours(value: unknown, category: HospitalSupplyCategory): number {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 168) return Math.trunc(n);
  return HOSPITAL_SUPPLY_CATEGORY_META[category].staleAfterHours;
}

function normalizeOptionalQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.trunc(n);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function clampText(value: unknown, max: number): string {
  return text(value).slice(0, max);
}
function optionalClampedText(value: unknown, max: number): string | null {
  return value === undefined ? null : clampText(value, max);
}

export function hasUnsafePublicSupplyText(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw);
  const hasPhoneLikeNumber = /(?:\d[\s().-]*){7,}/.test(raw);
  const hasContactMarker =
    /\b(telefono|whatsapp|contacto|contactar|llamar|sms|correo|email|poc|doctor|doctora|dr|dra)\b/.test(
      normalized,
    );
  const hasIdentityMarker =
    /\b(cedula|ci|dni|pasaporte|historia clinica|numero de historia)\b/.test(normalized);
  return hasEmail || hasPhoneLikeNumber || hasContactMarker || hasIdentityMarker;
}

// ============================================================================
// HOSPITALES
// ============================================================================

type HospitalRow = typeof hospitals.$inferSelect & {
  activePatients: number | string | null;
  totalPatients: number | string | null;
};

function rowToHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    facilityType: normalizeFacilityType(row.facilityType),
    state: row.state,
    municipality: row.municipality,
    address: row.address,
    level: normalizeLevel(row.level),
    priorityZone: normalizePriority(row.priorityZone),
    isPriority: Boolean(row.isPriority),
    activePatients: Number(row.activePatients ?? 0),
    totalPatients: Number(row.totalPatients ?? 0),
    createdAt: Number(row.createdAt),
  };
}

async function withSupplySummaries(list: Hospital[]): Promise<Hospital[]> {
  if (list.length === 0) return list;
  const summaries = await getPublicSupplySummariesForHospitals(list.map((h) => h.id));
  return list.map((hospital) => ({
    ...hospital,
    supplySummary: summaries.get(hospital.id),
  }));
}

export interface ListHospitalsOptions {
  state?: string;
  priorityZone?: HospitalPriorityZone | "all";
  search?: string;
  limit?: number;
  includeSupplySummary?: boolean;
}

export async function listHospitals(
  options: ListHospitalsOptions = {},
): Promise<Hospital[]> {
  const db = await getDb();
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 1000);
  const search = options.search?.trim() ?? "";
  const state = options.state?.trim() ?? "";
  const zone =
    options.priorityZone && options.priorityZone !== "all" ? options.priorityZone : null;

  const conditions = [sql`1=1`];
  if (state) conditions.push(sql`h.state = ${state}`);
  if (zone) conditions.push(sql`h.priority_zone = ${zone}`);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    conditions.push(
      sql`(LOWER(h.name) LIKE ${like} OR LOWER(h.municipality) LIKE ${like} OR LOWER(h.state) LIKE ${like})`,
    );
  }
  const whereSql = sql.join(conditions, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      h.id, h.external_id AS "externalId", h.name,
      h.facility_type AS "facilityType", h.state, h.municipality,
      h.address, h.level, h.priority_zone AS "priorityZone",
      h.is_priority AS "isPriority", h.created_at AS "createdAt",
      COALESCE(SUM(CASE WHEN p.status IN ('hospitalized', 'sheltered') THEN 1 ELSE 0 END), 0) AS "activePatients",
      COUNT(p.id) AS "totalPatients"
    FROM hospitals h
    LEFT JOIN hospital_patients p ON p.hospital_id = h.id
    WHERE ${whereSql}
    GROUP BY h.id
    ORDER BY
      "activePatients" DESC,
      CASE h.priority_zone WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      h.state, h.name
    LIMIT ${limit}
  `);
  const rows = (Array.isArray(result) ? result : result.rows) as HospitalRow[];
  const list = rows.map(rowToHospital);
  return options.includeSupplySummary ? withSupplySummaries(list) : list;
}

export async function listStates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ state: hospitals.state })
    .from(hospitals)
    .where(sql`${hospitals.state} <> ''`)
    .orderBy(hospitals.state);
  return rows.map((r) => r.state);
}

export async function getHospital(
  id: string,
  options: { includeSupplySummary?: boolean } = {},
): Promise<Hospital | null> {
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT
      h.id, h.external_id AS "externalId", h.name,
      h.facility_type AS "facilityType", h.state, h.municipality,
      h.address, h.level, h.priority_zone AS "priorityZone",
      h.is_priority AS "isPriority", h.created_at AS "createdAt",
      COALESCE(SUM(CASE WHEN p.status IN ('hospitalized', 'sheltered') THEN 1 ELSE 0 END), 0) AS "activePatients",
      COUNT(p.id) AS "totalPatients"
    FROM hospitals h
    LEFT JOIN hospital_patients p ON p.hospital_id = h.id
    WHERE h.id = ${id}
    GROUP BY h.id
  `);
  const rows = (Array.isArray(result) ? result : result.rows) as HospitalRow[];
  const first = rows[0];
  if (first) {
    const hospital = rowToHospital(first);
    return options.includeSupplySummary
      ? (await withSupplySummaries([hospital]))[0]!
      : hospital;
  }

  // Fallback por slug: carga el catálogo y matchea por slug (como el Next route).
  const list = await listHospitals({ limit: 1000 });
  const match = list.find((h) => matchesHospitalSlug(h, id));
  if (!match) return null;
  return options.includeSupplySummary
    ? (await withSupplySummaries([match]))[0]!
    : match;
}

export interface NewHospital {
  name: string;
  facilityType?: HospitalFacilityType;
  state: string;
  municipality?: string;
  address?: string;
  level?: HospitalLevel;
  priorityZone?: HospitalPriorityZone;
}

export async function addHospital(input: NewHospital): Promise<Hospital> {
  const db = await getDb();
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("El nombre es obligatorio.");

  const hospital: Hospital = {
    id: crypto.randomUUID(),
    externalId: null,
    name: name.slice(0, 200),
    facilityType: input.facilityType ?? "hospital",
    state: (input.state ?? "").trim().slice(0, 120),
    municipality: (input.municipality ?? "").trim().slice(0, 120),
    address: (input.address ?? "").trim().slice(0, 400),
    level: input.level ?? null,
    priorityZone: input.priorityZone ?? "P3",
    isPriority: input.priorityZone === "P0" || input.priorityZone === "P1",
    activePatients: 0,
    totalPatients: 0,
    createdAt: Date.now(),
  };

  await db.insert(hospitals).values({
    id: hospital.id,
    externalId: null,
    name: hospital.name,
    facilityType: hospital.facilityType,
    state: hospital.state,
    municipality: hospital.municipality,
    address: hospital.address,
    level: hospital.level,
    priorityZone: hospital.priorityZone,
    isPriority: hospital.isPriority,
    createdAt: hospital.createdAt,
  });
  return hospital;
}

export interface UpdateHospitalInput {
  name?: string;
  facilityType?: HospitalFacilityType;
  state?: string;
  municipality?: string;
  address?: string;
  level?: HospitalLevel;
  priorityZone?: HospitalPriorityZone;
}

/**
 * Actualiza campos permitidos de un hospital (no se mueve id/externalId/createdAt
 * ni los contadores derivados de pacientes). `isPriority` se re-deriva de la zona,
 * igual que en addHospital. Devuelve el DTO actualizado o null si no existe.
 */
export async function updateHospital(
  id: string,
  input: UpdateHospitalInput,
): Promise<Hospital | null> {
  const db = await getDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("El nombre es obligatorio.");
    patch.name = name.slice(0, MAX_HOSPITAL_NAME);
  }
  if (input.facilityType !== undefined) patch.facilityType = normalizeFacilityType(input.facilityType);
  if (input.state !== undefined) patch.state = input.state.trim().slice(0, 120);
  if (input.municipality !== undefined) patch.municipality = input.municipality.trim().slice(0, 120);
  if (input.address !== undefined) patch.address = input.address.trim().slice(0, 400);
  if (input.level !== undefined) patch.level = normalizeLevel(input.level);
  if (input.priorityZone !== undefined) {
    const zone = normalizePriority(input.priorityZone);
    patch.priorityZone = zone;
    patch.isPriority = zone === "P0" || zone === "P1";
  }
  if (Object.keys(patch).length === 0) return getHospital(id);
  await db.update(hospitals).set(patch).where(eq(hospitals.id, id));
  return getHospital(id);
}

/** Elimina un hospital. True si existía. */
export async function removeHospital(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    sql`DELETE FROM ${hospitals} WHERE ${hospitals.id} = ${id} RETURNING ${hospitals.id}`,
  );
  const rows = (Array.isArray(result) ? result : result.rows) as unknown[];
  return rows.length > 0;
}

// ============================================================================
// PACIENTES
// ============================================================================

type PatientRow = typeof hospitalPatients.$inferSelect;

function rowToPatient(row: PatientRow): HospitalPatient {
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    name: row.name,
    age: row.age === null ? null : Number(row.age),
    condition: PATIENT_CONDITIONS.has(row.condition as PatientCondition)
      ? (row.condition as PatientCondition)
      : "unknown",
    status: PATIENT_STATUSES.has(row.status as PatientStatus)
      ? (row.status as PatientStatus)
      : "hospitalized",
    notes: row.notes,
    contact: row.contact,
    admittedAt: Number(row.admittedAt),
    updatedAt: Number(row.updatedAt),
  };
}

export async function listPatients(hospitalId: string): Promise<HospitalPatient[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hospitalPatients)
    .where(eq(hospitalPatients.hospitalId, hospitalId))
    .orderBy(
      sql`CASE WHEN ${hospitalPatients.status} IN ('hospitalized', 'sheltered') THEN 0 ELSE 1 END`,
      sql`${hospitalPatients.admittedAt} DESC`,
    )
    .limit(500);
  return rows.map(rowToPatient);
}

export function toPublicPatient(patient: HospitalPatient): PublicHospitalPatient {
  const { notes: _notes, ...publicPatient } = patient;
  return publicPatient;
}

export interface NewHospitalPatient {
  name: string;
  age?: number | string | null;
  condition?: PatientCondition;
  status?: PatientStatus;
  notes?: string;
  contact?: string;
}

export async function addPatient(
  hospitalId: string,
  input: NewHospitalPatient,
): Promise<HospitalPatient> {
  const db = await getDb();
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("El nombre del paciente es obligatorio.");

  const now = Date.now();
  const condition = PATIENT_CONDITIONS.has(input.condition as PatientCondition)
    ? (input.condition as PatientCondition)
    : "unknown";
  const status = PATIENT_STATUSES.has(input.status as PatientStatus)
    ? (input.status as PatientStatus)
    : "hospitalized";

  const patient: HospitalPatient = {
    id: crypto.randomUUID(),
    hospitalId,
    name: name.slice(0, 120),
    age: normalizeAge(input.age),
    condition,
    status,
    notes: (input.notes ?? "").trim().slice(0, 600),
    contact: (input.contact ?? "").trim().slice(0, 120),
    admittedAt: now,
    updatedAt: now,
  };

  await db.insert(hospitalPatients).values({
    id: patient.id,
    hospitalId,
    name: patient.name,
    age: patient.age,
    condition: patient.condition,
    status: patient.status,
    notes: patient.notes,
    contact: patient.contact,
    admittedAt: patient.admittedAt,
    updatedAt: patient.updatedAt,
  });
  return patient;
}

export async function deletePatient(
  hospitalId: string,
  patientId: string,
): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    sql`DELETE FROM ${hospitalPatients}
        WHERE ${hospitalPatients.id} = ${patientId}
          AND ${hospitalPatients.hospitalId} = ${hospitalId}
        RETURNING ${hospitalPatients.id}`,
  );
  const rows = (Array.isArray(result) ? result : result.rows) as unknown[];
  return rows.length > 0;
}

// ============================================================================
// INSUMOS (supplies) — portado de lib/hospital-supplies.ts
// ============================================================================

const STATUS_RANK: Record<HospitalSupplyStatus, number> = {
  red: 3,
  yellow: 2,
  unknown: 1,
  green: 0,
};

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

type StatusRow = typeof hospitalSupplyStatuses.$inferSelect;
type NeedRow = typeof hospitalSupplyNeeds.$inferSelect;
type HelpRow = typeof hospitalSupplyHelpRequests.$inferSelect;
type PocRow = typeof hospitalPocAssignments.$inferSelect;

export interface SupplyStatusUpdateInput {
  category?: unknown;
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  staleAfterHours?: unknown;
  updatedBy?: unknown;
  source?: unknown;
  confirmOnly?: unknown;
}
export interface SupplyNeedInput {
  category?: unknown;
  itemType?: unknown;
  quantity?: unknown;
  unit?: unknown;
  urgency?: unknown;
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  updatedBy?: unknown;
  source?: unknown;
}
export interface SupplyNeedPatchInput {
  status?: unknown;
  publicNote?: unknown;
  restrictedNote?: unknown;
  updatedBy?: unknown;
  source?: unknown;
}
export interface SupplyHelpRequestInput {
  category?: unknown;
  message?: unknown;
  urgency?: unknown;
  requestedBy?: unknown;
  source?: unknown;
  restrictedNote?: unknown;
}
export interface SupplyHelpPatchInput {
  status?: unknown;
  restrictedNote?: unknown;
  requestedBy?: unknown;
  source?: unknown;
}

interface ValidStatusUpdate {
  category: HospitalSupplyCategory;
  status: HospitalSupplyStatus | null;
  publicNote: string | null;
  restrictedNote: string | null;
  staleAfterHours: number | null;
  updatedBy: string;
  source: string;
  confirmOnly: boolean;
}
interface ValidNeedInput {
  category: HospitalSupplyCategory;
  itemType: string;
  quantity: number | null;
  unit: string;
  urgency: HospitalSupplyStatus;
  status: HospitalSupplyNeedStatus;
  publicNote: string;
  restrictedNote: string;
  updatedBy: string;
  source: string;
}
interface ValidNeedPatch {
  status: HospitalSupplyNeedStatus | null;
  publicNote: string | null;
  restrictedNote: string | null;
  updatedBy: string;
  source: string;
}
interface ValidHelpInput {
  category: HospitalSupplyCategory;
  message: string;
  urgency: HospitalSupplyStatus;
  requestedBy: string;
  source: string;
  restrictedNote: string;
}
interface ValidHelpPatch {
  status: HospitalSupplyHelpStatus | null;
  restrictedNote: string | null;
  requestedBy: string;
  source: string;
}

function rejectUnsafePublicText(
  fields: Array<[string, unknown]>,
): { ok: false; error: string } | null {
  const unsafe = fields.find(([, value]) => hasUnsafePublicSupplyText(value));
  if (!unsafe) return null;
  return {
    ok: false,
    error: `No publiques ${unsafe[0]} con contactos, POC o datos identificables. Muévelo a la nota restringida.`,
  };
}

function deriveSupplyFreshness(
  input: { lastUpdatedAt: number; lastConfirmedAt: number; staleAfterHours: number },
  now: number = Date.now(),
): SupplyFreshness {
  const staleAfterHours = Math.max(1, Math.trunc(input.staleAfterHours));
  return {
    lastUpdatedAt: input.lastUpdatedAt,
    lastConfirmedAt: input.lastConfirmedAt,
    staleAfterHours,
    isStale: now - input.lastConfirmedAt > staleAfterHours * 60 * 60 * 1000,
    updatedAgo: timeAgo(input.lastUpdatedAt, now),
    confirmedAgo: timeAgo(input.lastConfirmedAt, now),
  };
}

function validateSupplyStatusUpdate(
  input: SupplyStatusUpdateInput,
): Validation<ValidStatusUpdate> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };
  const confirmOnly = input.confirmOnly === true;
  const status = normalizeSupplyStatus(input.status);
  if (!confirmOnly && !status) return { ok: false, error: "Indica un semáforo válido." };
  const unsafe = rejectUnsafePublicText([["nota pública", input.publicNote]]);
  if (unsafe) return unsafe;
  return {
    ok: true,
    value: {
      category,
      status,
      publicNote: optionalClampedText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote: optionalClampedText(input.restrictedNote, MAX_SUPPLY_NOTE),
      staleAfterHours:
        input.staleAfterHours === undefined
          ? null
          : normalizeStaleAfterHours(input.staleAfterHours, category),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
      confirmOnly,
    },
  };
}

function validateSupplyNeedInput(input: SupplyNeedInput): Validation<ValidNeedInput> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };
  const itemType = clampText(input.itemType, MAX_SUPPLY_ITEM);
  if (!itemType) return { ok: false, error: "Indica el insumo o tipo requerido." };
  const unsafe = rejectUnsafePublicText([
    ["insumo/tipo", input.itemType],
    ["unidad", input.unit],
    ["nota pública", input.publicNote],
  ]);
  if (unsafe) return unsafe;
  const urgency = normalizeSupplyStatus(input.urgency) ?? "yellow";
  if (urgency === "green") {
    return { ok: false, error: "La urgencia de una necesidad no puede ser verde." };
  }
  return {
    ok: true,
    value: {
      category,
      itemType,
      quantity: normalizeOptionalQuantity(input.quantity),
      unit: clampText(input.unit, MAX_SUPPLY_UNIT),
      urgency,
      status: normalizeNeedStatus(input.status) ?? "active",
      publicNote: clampText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote: clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

function validateSupplyNeedPatch(input: SupplyNeedPatchInput): Validation<ValidNeedPatch> {
  const status = input.status === undefined ? null : normalizeNeedStatus(input.status);
  if (input.status !== undefined && !status) {
    return { ok: false, error: "Estado de necesidad inválido." };
  }
  return {
    ok: true,
    value: {
      status,
      publicNote:
        input.publicNote === undefined ? null : clampText(input.publicNote, MAX_SUPPLY_NOTE),
      restrictedNote:
        input.restrictedNote === undefined
          ? null
          : clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      updatedBy: clampText(input.updatedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

function validateSupplyHelpRequest(
  input: SupplyHelpRequestInput,
): Validation<ValidHelpInput> {
  const category = normalizeSupplyCategory(input.category);
  if (!category) return { ok: false, error: "Categoría de insumos inválida." };
  const message = clampText(input.message, MAX_SUPPLY_HELP_MESSAGE);
  if (!message) return { ok: false, error: "Indica un mensaje corto." };
  const urgency = normalizeSupplyStatus(input.urgency) ?? "yellow";
  if (urgency === "green") {
    return { ok: false, error: "La urgencia de ayuda no puede ser verde." };
  }
  return {
    ok: true,
    value: {
      category,
      message,
      urgency,
      requestedBy: clampText(input.requestedBy, MAX_SUPPLY_ACTOR) || "poc_hospitalario",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
      restrictedNote: clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
    },
  };
}

function validateSupplyHelpPatch(input: SupplyHelpPatchInput): Validation<ValidHelpPatch> {
  const status = input.status === undefined ? null : normalizeHelpStatus(input.status);
  if (input.status !== undefined && !status) {
    return { ok: false, error: "Estado de solicitud inválido." };
  }
  return {
    ok: true,
    value: {
      status,
      restrictedNote:
        input.restrictedNote === undefined
          ? null
          : clampText(input.restrictedNote, MAX_SUPPLY_NOTE),
      requestedBy: clampText(input.requestedBy, MAX_SUPPLY_ACTOR) || "equipo_operativo",
      source: clampText(input.source, MAX_SUPPLY_ACTOR) || "admin_panel",
    },
  };
}

function rowToRestrictedStatus(
  row: StatusRow,
  now: number = Date.now(),
): RestrictedHospitalSupplyStatus {
  const category = normalizeSupplyCategory(row.category) ?? "other";
  const status = normalizeSupplyStatus(row.status) ?? "unknown";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    status,
    label: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    publicNote: row.publicNote,
    restrictedNote: row.restrictedNote,
    updatedBy: row.updatedBy,
    source: row.source,
    freshness: deriveSupplyFreshness(
      {
        lastUpdatedAt: Number(row.lastUpdatedAt),
        lastConfirmedAt: Number(row.lastConfirmedAt),
        staleAfterHours: Number(row.staleAfterHours),
      },
      now,
    ),
  };
}

function rowToRestrictedNeed(
  row: NeedRow,
  now: number = Date.now(),
): RestrictedHospitalSupplyNeed {
  const category = normalizeSupplyCategory(row.category) ?? "other";
  const urgency = normalizeSupplyStatus(row.urgency) ?? "yellow";
  const status = normalizeNeedStatus(row.status) ?? "active";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    itemType: row.itemType,
    quantity: row.quantity,
    unit: row.unit,
    urgency,
    status,
    publicNote: row.publicNote,
    restrictedNote: row.restrictedNote,
    updatedBy: row.updatedBy,
    source: row.source,
    lastConfirmedAt: Number(row.lastConfirmedAt),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    updatedAgo: timeAgo(Number(row.updatedAt), now),
  };
}

function rowToHelpRequest(
  row: HelpRow,
  now: number = Date.now(),
): HospitalSupplyHelpRequest {
  const category = normalizeSupplyCategory(row.category) ?? "other";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    category,
    categoryLabel: HOSPITAL_SUPPLY_CATEGORY_META[category].label,
    message: row.message,
    urgency: normalizeSupplyStatus(row.urgency) ?? "yellow",
    status: normalizeHelpStatus(row.status) ?? "open",
    requestedBy: row.requestedBy,
    source: row.source,
    restrictedNote: row.restrictedNote,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    updatedAgo: timeAgo(Number(row.updatedAt), now),
  };
}

function redactPublicNeed(need: RestrictedHospitalSupplyNeed): PublicHospitalSupplyNeed {
  return {
    id: need.id,
    hospitalId: need.hospitalId,
    category: need.category,
    categoryLabel: need.categoryLabel,
    itemType: need.itemType,
    quantity: need.quantity,
    unit: need.unit,
    urgency: need.urgency,
    status: need.status,
    publicNote: need.publicNote,
    lastConfirmedAt: need.lastConfirmedAt,
    updatedAt: need.updatedAt,
    updatedAgo: need.updatedAgo,
  };
}

function redactPublicStatus(
  status: RestrictedHospitalSupplyStatus,
): PublicHospitalSupplyStatus {
  return {
    category: status.category,
    status: status.status,
    label: status.label,
    publicNote: status.publicNote,
    freshness: status.freshness,
  };
}

function buildSupplySummary(
  statuses: RestrictedHospitalSupplyStatus[],
  needs: RestrictedHospitalSupplyNeed[],
): PublicHospitalSupplySummary {
  const publicNeeds = needs
    .filter((need) => ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES.has(need.status))
    .map(redactPublicNeed);
  const publicStatuses = statuses.map(redactPublicStatus);

  let worstStatus: HospitalSupplyStatus = "unknown";
  let red = 0;
  let yellow = 0;
  let stale = 0;
  let lastConfirmedAt: number | null = null;
  for (const status of publicStatuses) {
    if (status.status === "red") red += 1;
    if (status.status === "yellow") yellow += 1;
    if (status.freshness.isStale) stale += 1;
    if (STATUS_RANK[status.status] > STATUS_RANK[worstStatus]) worstStatus = status.status;
    lastConfirmedAt = Math.max(lastConfirmedAt ?? 0, status.freshness.lastConfirmedAt);
  }
  for (const need of publicNeeds) {
    if (STATUS_RANK[need.urgency] > STATUS_RANK[worstStatus]) worstStatus = need.urgency;
    if (need.urgency === "red") red += 1;
    if (need.urgency === "yellow") yellow += 1;
    lastConfirmedAt = Math.max(lastConfirmedAt ?? 0, need.lastConfirmedAt);
  }

  return {
    statuses: publicStatuses,
    activeNeeds: publicNeeds,
    counts: { red, yellow, stale, activeNeeds: publicNeeds.length },
    worstStatus,
    lastConfirmedAt,
  };
}

function emptySummary(): PublicHospitalSupplySummary {
  return {
    statuses: [],
    activeNeeds: [],
    counts: { red: 0, yellow: 0, stale: 0, activeNeeds: 0 },
    worstStatus: "unknown",
    lastConfirmedAt: null,
  };
}

async function logSupplyEvent(input: {
  hospitalId: string;
  category?: HospitalSupplyCategory | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  actor: string;
  source: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  await db.insert(hospitalSupplyEvents).values({
    id: crypto.randomUUID(),
    hospitalId: input.hospitalId,
    category: input.category ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    actor: input.actor,
    source: input.source,
    payload: input.payload,
    createdAt: Date.now(),
  });
}

export async function upsertHospitalSupplyStatus(
  hospitalId: string,
  input: SupplyStatusUpdateInput,
): Promise<Validation<RestrictedHospitalSupplyStatus>> {
  const parsed = validateSupplyStatusUpdate(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();
  const db = await getDb();

  const existing = await db
    .select()
    .from(hospitalSupplyStatuses)
    .where(
      and(
        eq(hospitalSupplyStatuses.hospitalId, hospitalId),
        eq(hospitalSupplyStatuses.category, value.category),
      ),
    )
    .limit(1);
  const previous = existing[0];
  if (value.confirmOnly && !previous) {
    return { ok: false, error: "No hay reporte previo para confirmar sin cambios." };
  }
  const nextStatus =
    value.confirmOnly && previous
      ? normalizeSupplyStatus(previous.status) ?? "unknown"
      : value.status ?? "unknown";
  const nextPublicNote = value.confirmOnly
    ? previous?.publicNote ?? ""
    : value.publicNote ?? previous?.publicNote ?? "";
  const nextRestrictedNote = value.confirmOnly
    ? previous?.restrictedNote ?? ""
    : value.restrictedNote ?? previous?.restrictedNote ?? "";
  const staleAfterHours =
    value.staleAfterHours ??
    previous?.staleAfterHours ??
    HOSPITAL_SUPPLY_CATEGORY_META[value.category].staleAfterHours;
  const lastUpdatedAt = value.confirmOnly && previous ? previous.lastUpdatedAt : now;

  const rows = await db
    .insert(hospitalSupplyStatuses)
    .values({
      id: previous?.id ?? crypto.randomUUID(),
      hospitalId,
      category: value.category,
      status: nextStatus,
      publicNote: nextPublicNote,
      restrictedNote: nextRestrictedNote,
      staleAfterHours,
      lastUpdatedAt,
      lastConfirmedAt: now,
      updatedBy: value.updatedBy,
      source: value.source,
      createdAt: previous?.createdAt ?? now,
    })
    .onConflictDoUpdate({
      target: [hospitalSupplyStatuses.hospitalId, hospitalSupplyStatuses.category],
      set: {
        status: nextStatus,
        publicNote: nextPublicNote,
        restrictedNote: nextRestrictedNote,
        staleAfterHours,
        lastUpdatedAt,
        lastConfirmedAt: now,
        updatedBy: value.updatedBy,
        source: value.source,
      },
    })
    .returning();

  await logSupplyEvent({
    hospitalId,
    category: value.category,
    entityType: "status",
    entityId: rows[0]?.id,
    action: value.confirmOnly ? "confirmed_no_changes" : "upserted_status",
    actor: value.updatedBy,
    source: value.source,
    payload: { status: nextStatus },
  });
  return { ok: true, value: rowToRestrictedStatus(rows[0]!) };
}

export async function createHospitalSupplyNeed(
  hospitalId: string,
  input: SupplyNeedInput,
): Promise<Validation<RestrictedHospitalSupplyNeed>> {
  const parsed = validateSupplyNeedInput(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();
  const db = await getDb();

  const rows = await db
    .insert(hospitalSupplyNeeds)
    .values({
      id: crypto.randomUUID(),
      hospitalId,
      category: value.category,
      itemType: value.itemType,
      quantity: value.quantity,
      unit: value.unit,
      urgency: value.urgency,
      status: value.status,
      publicNote: value.publicNote,
      restrictedNote: value.restrictedNote,
      lastConfirmedAt: now,
      updatedBy: value.updatedBy,
      source: value.source,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await logSupplyEvent({
    hospitalId,
    category: value.category,
    entityType: "need",
    entityId: rows[0]?.id,
    action: "created_need",
    actor: value.updatedBy,
    source: value.source,
    payload: { itemType: value.itemType, urgency: value.urgency },
  });
  return { ok: true, value: rowToRestrictedNeed(rows[0]!) };
}

export async function updateHospitalSupplyNeed(
  hospitalId: string,
  needId: string,
  input: SupplyNeedPatchInput,
): Promise<Validation<RestrictedHospitalSupplyNeed | null>> {
  const parsed = validateSupplyNeedPatch(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();
  const db = await getDb();

  const existing = await db
    .select()
    .from(hospitalSupplyNeeds)
    .where(
      and(
        eq(hospitalSupplyNeeds.hospitalId, hospitalId),
        eq(hospitalSupplyNeeds.id, needId),
      ),
    )
    .limit(1);
  if (!existing[0]) return { ok: true, value: null };
  const current = existing[0];
  const rows = await db
    .update(hospitalSupplyNeeds)
    .set({
      status: value.status ?? current.status,
      publicNote: value.publicNote ?? current.publicNote,
      restrictedNote: value.restrictedNote ?? current.restrictedNote,
      updatedBy: value.updatedBy,
      source: value.source,
      lastConfirmedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(hospitalSupplyNeeds.hospitalId, hospitalId),
        eq(hospitalSupplyNeeds.id, needId),
      ),
    )
    .returning();
  await logSupplyEvent({
    hospitalId,
    category: normalizeSupplyCategory(rows[0]?.category),
    entityType: "need",
    entityId: needId,
    action: "updated_need",
    actor: value.updatedBy,
    source: value.source,
    payload: { status: rows[0]?.status },
  });
  return { ok: true, value: rowToRestrictedNeed(rows[0]!) };
}

export async function createHospitalSupplyHelpRequest(
  hospitalId: string,
  input: SupplyHelpRequestInput,
): Promise<Validation<HospitalSupplyHelpRequest>> {
  const parsed = validateSupplyHelpRequest(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();
  const db = await getDb();

  const rows = await db
    .insert(hospitalSupplyHelpRequests)
    .values({
      id: crypto.randomUUID(),
      hospitalId,
      category: value.category,
      message: value.message,
      urgency: value.urgency,
      status: "open",
      requestedBy: value.requestedBy,
      source: value.source,
      restrictedNote: value.restrictedNote,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await logSupplyEvent({
    hospitalId,
    category: value.category,
    entityType: "help_request",
    entityId: rows[0]?.id,
    action: "created_help_request",
    actor: value.requestedBy,
    source: value.source,
    payload: { urgency: value.urgency },
  });
  return { ok: true, value: rowToHelpRequest(rows[0]!) };
}

export async function updateHospitalSupplyHelpRequest(
  hospitalId: string,
  requestId: string,
  input: SupplyHelpPatchInput,
): Promise<Validation<HospitalSupplyHelpRequest | null>> {
  const parsed = validateSupplyHelpPatch(input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const now = Date.now();
  const db = await getDb();

  const existing = await db
    .select()
    .from(hospitalSupplyHelpRequests)
    .where(
      and(
        eq(hospitalSupplyHelpRequests.hospitalId, hospitalId),
        eq(hospitalSupplyHelpRequests.id, requestId),
      ),
    )
    .limit(1);
  if (!existing[0]) return { ok: true, value: null };
  const current = existing[0];
  const rows = await db
    .update(hospitalSupplyHelpRequests)
    .set({
      status: value.status ?? current.status,
      restrictedNote: value.restrictedNote ?? current.restrictedNote,
      requestedBy: value.requestedBy,
      source: value.source,
      updatedAt: now,
    })
    .where(
      and(
        eq(hospitalSupplyHelpRequests.hospitalId, hospitalId),
        eq(hospitalSupplyHelpRequests.id, requestId),
      ),
    )
    .returning();
  await logSupplyEvent({
    hospitalId,
    category: normalizeSupplyCategory(rows[0]?.category),
    entityType: "help_request",
    entityId: requestId,
    action: "updated_help_request",
    actor: value.requestedBy,
    source: value.source,
    payload: { status: rows[0]?.status },
  });
  return { ok: true, value: rowToHelpRequest(rows[0]!) };
}

async function loadPublicSupplySummariesForHospitalIds(
  hospitalIds: string[],
): Promise<Map<string, PublicHospitalSupplySummary>> {
  const uniqueIds = [...new Set(hospitalIds)].filter(Boolean);
  const grouped = new Map<
    string,
    {
      statuses: RestrictedHospitalSupplyStatus[];
      activeNeeds: RestrictedHospitalSupplyNeed[];
    }
  >();
  for (const hospitalId of uniqueIds) {
    grouped.set(hospitalId, { statuses: [], activeNeeds: [] });
  }
  if (uniqueIds.length === 0) return new Map();

  const now = Date.now();
  const db = await getDb();
  const [statusRows, needRows] = await Promise.all([
    db
      .select()
      .from(hospitalSupplyStatuses)
      .where(inArray(hospitalSupplyStatuses.hospitalId, uniqueIds)),
    db
      .select()
      .from(hospitalSupplyNeeds)
      .where(
        and(
          inArray(hospitalSupplyNeeds.hospitalId, uniqueIds),
          inArray(hospitalSupplyNeeds.status, [...ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES]),
        ),
      )
      .orderBy(desc(hospitalSupplyNeeds.updatedAt)),
  ]);

  for (const row of statusRows) {
    grouped.get(row.hospitalId)?.statuses.push(rowToRestrictedStatus(row, now));
  }
  for (const row of needRows) {
    grouped.get(row.hospitalId)?.activeNeeds.push(rowToRestrictedNeed(row, now));
  }

  const map = new Map<string, PublicHospitalSupplySummary>();
  for (const [hospitalId, snapshot] of grouped) {
    snapshot.statuses.sort(
      (a, b) =>
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(a.category) -
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(b.category),
    );
    snapshot.activeNeeds.sort((a, b) => b.updatedAt - a.updatedAt);
    map.set(hospitalId, buildSupplySummary(snapshot.statuses, snapshot.activeNeeds));
  }
  return map;
}

export async function getPublicHospitalSupplySummary(
  hospitalId: string,
): Promise<PublicHospitalSupplySummary> {
  const summaries = await loadPublicSupplySummariesForHospitalIds([hospitalId]);
  return summaries.get(hospitalId) ?? emptySummary();
}

export async function getPublicSupplySummariesForHospitals(
  hospitalIds: string[],
): Promise<Map<string, PublicHospitalSupplySummary>> {
  return loadPublicSupplySummariesForHospitalIds(hospitalIds);
}

// ============================================================================
// Snapshots restringidos (admin-only) — portado de lib/hospital-supplies.ts
// ============================================================================

function rowToPoc(row: PocRow): HospitalPocAssignment {
  const role =
    row.role === "operator_admin" ||
    row.role === "hospital_poc" ||
    row.role === "ops_reader"
      ? row.role
      : "hospital_poc";
  return {
    id: row.id,
    hospitalId: row.hospitalId,
    displayName: row.displayName,
    role,
    restrictedContact: row.restrictedContact,
    active: Boolean(row.active),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

async function loadRestrictedSupplyForHospitalIds(
  hospitalIds: string[],
): Promise<Map<string, RestrictedHospitalSupplySnapshot>> {
  const uniqueIds = [...new Set(hospitalIds)].filter(Boolean);
  const map = new Map<string, RestrictedHospitalSupplySnapshot>();
  for (const hospitalId of uniqueIds) {
    map.set(hospitalId, {
      hospitalId,
      summary: emptySummary(),
      statuses: [],
      activeNeeds: [],
      helpRequests: [],
      pocs: [],
    });
  }
  if (uniqueIds.length === 0) return map;

  const now = Date.now();
  const db = await getDb();
  const [statusRows, needRows, helpRows, pocRows] = await Promise.all([
    db
      .select()
      .from(hospitalSupplyStatuses)
      .where(inArray(hospitalSupplyStatuses.hospitalId, uniqueIds)),
    db
      .select()
      .from(hospitalSupplyNeeds)
      .where(
        and(
          inArray(hospitalSupplyNeeds.hospitalId, uniqueIds),
          inArray(hospitalSupplyNeeds.status, [...ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES]),
        ),
      )
      .orderBy(desc(hospitalSupplyNeeds.updatedAt)),
    db
      .select()
      .from(hospitalSupplyHelpRequests)
      .where(
        and(
          inArray(hospitalSupplyHelpRequests.hospitalId, uniqueIds),
          inArray(hospitalSupplyHelpRequests.status, ["open", "contacting"]),
        ),
      )
      .orderBy(desc(hospitalSupplyHelpRequests.updatedAt)),
    db
      .select()
      .from(hospitalPocAssignments)
      .where(inArray(hospitalPocAssignments.hospitalId, uniqueIds)),
  ]);

  for (const row of statusRows) {
    map.get(row.hospitalId)?.statuses.push(rowToRestrictedStatus(row, now));
  }
  for (const row of needRows) {
    map.get(row.hospitalId)?.activeNeeds.push(rowToRestrictedNeed(row, now));
  }
  for (const row of helpRows) {
    map.get(row.hospitalId)?.helpRequests.push(rowToHelpRequest(row, now));
  }
  for (const row of pocRows) {
    map.get(row.hospitalId)?.pocs.push(rowToPoc(row));
  }

  for (const snapshot of map.values()) {
    snapshot.statuses.sort(
      (a, b) =>
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(a.category) -
        HOSPITAL_SUPPLY_CATEGORIES.indexOf(b.category),
    );
    snapshot.activeNeeds.sort((a, b) => b.updatedAt - a.updatedAt);
    snapshot.helpRequests.sort((a, b) => b.updatedAt - a.updatedAt);
    snapshot.summary = buildSupplySummary(snapshot.statuses, snapshot.activeNeeds);
  }
  return map;
}

export async function getRestrictedHospitalSupplySnapshot(
  hospitalId: string,
): Promise<RestrictedHospitalSupplySnapshot> {
  const snapshots = await loadRestrictedSupplyForHospitalIds([hospitalId]);
  return (
    snapshots.get(hospitalId) ?? {
      hospitalId,
      summary: emptySummary(),
      statuses: [],
      activeNeeds: [],
      helpRequests: [],
      pocs: [],
    }
  );
}

export async function listRestrictedSupplySnapshotsForHospitals(
  hospitalIds: string[],
): Promise<Map<string, RestrictedHospitalSupplySnapshot>> {
  return loadRestrictedSupplyForHospitalIds(hospitalIds);
}

// ============================================================================
// Bitácora de insumos (hospital_supply_events) — lectura para el panel admin
// ============================================================================

export interface HospitalSupplyEventEntry {
  id: string;
  hospitalId: string;
  category: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  actor: string;
  source: string;
  payload: unknown;
  createdAt: number;
}

export const MAX_SUPPLY_EVENTS_LIMIT = 200;

/**
 * Últimos eventos de insumos de un hospital, más reciente primero. Superficie
 * restringida (capability-gated): el payload puede incluir notas restringidas,
 * igual que el snapshot restringido que ya ve el mismo caller.
 */
export async function listHospitalSupplyEvents(
  hospitalId: string,
  limit = 50,
): Promise<HospitalSupplyEventEntry[]> {
  const db = await getDb();
  const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_SUPPLY_EVENTS_LIMIT);
  const rows = await db
    .select()
    .from(hospitalSupplyEvents)
    .where(eq(hospitalSupplyEvents.hospitalId, hospitalId))
    .orderBy(desc(hospitalSupplyEvents.createdAt))
    .limit(capped);
  // DTO explícito (allowlist), nunca la fila cruda.
  return rows.map((row) => ({
    id: row.id,
    hospitalId: row.hospitalId,
    category: row.category,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actor: row.actor,
    source: row.source,
    payload: row.payload,
    createdAt: row.createdAt,
  }));
}
