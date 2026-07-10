export type HospitalPriorityZone = "P0" | "P1" | "P2" | "P3";

export type HospitalFacilityType =
  | "hospital"
  | "hospital_ivss"
  | "hospital_militar"
  | "hospital_pediatrico"
  | "maternidad"
  | "cdi";

export type HospitalLevel = "I" | "II" | "III" | "IV" | "militar" | null;

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

export type PatientStatus = "hospitalized" | "discharged" | "transferred" | "deceased";

export type PatientCondition = "stable" | "serious" | "critical" | "recovering" | "unknown";

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

export interface NewHospital {
  name: string;
  facilityType?: HospitalFacilityType;
  state: string;
  municipality?: string;
  address?: string;
  level?: HospitalLevel;
  priorityZone?: HospitalPriorityZone;
}

export interface NewHospitalPatient {
  name: string;
  age?: number | string | null;
  condition?: PatientCondition;
  status?: PatientStatus;
  notes?: string;
  contact?: string;
}

export const MAX_HOSPITAL_NAME = 200;
export const MAX_HOSPITAL_ADDRESS = 400;
export const MAX_HOSPITAL_FIELD = 120;

export const MAX_PATIENT_NAME = 120;
export const MAX_PATIENT_NOTES = 600;
export const MAX_PATIENT_CONTACT = 120;

export const HOSPITAL_FACILITY_TYPES: ReadonlySet<HospitalFacilityType> = new Set([
  "hospital",
  "hospital_ivss",
  "hospital_militar",
  "hospital_pediatrico",
  "maternidad",
  "cdi",
]);

export const PRIORITY_ZONES: ReadonlySet<HospitalPriorityZone> = new Set([
  "P0",
  "P1",
  "P2",
  "P3",
]);

export const PATIENT_STATUSES: ReadonlySet<PatientStatus> = new Set([
  "hospitalized",
  "discharged",
  "transferred",
  "deceased",
]);

export const PATIENT_CONDITIONS: ReadonlySet<PatientCondition> = new Set([
  "stable",
  "serious",
  "critical",
  "recovering",
  "unknown",
]);

export const PRIORITY_ZONE_META: Record<
  HospitalPriorityZone,
  { label: string; description: string; color: string; emoji: string }
> = {
  P0: {
    label: "Zona cero",
    description: "Afectación inmediata. Máxima prioridad de atención.",
    color: "#dc2626",
    emoji: "🔴",
  },
  P1: {
    label: "Corredor de afectación",
    description: "Zona cercana al epicentro con impacto directo.",
    color: "#ea580c",
    emoji: "🟠",
  },
  P2: {
    label: "Expansión / recuperación",
    description: "Hospitales de soporte para la recuperación regional.",
    color: "#eab308",
    emoji: "🟡",
  },
  P3: {
    label: "Base nacional",
    description: "Red nacional de respaldo.",
    color: "#0ea5e9",
    emoji: "🔵",
  },
};

export const FACILITY_TYPE_META: Record<
  HospitalFacilityType,
  { label: string; emoji: string }
> = {
  hospital: { label: "Hospital", emoji: "🏥" },
  hospital_ivss: { label: "Hospital IVSS", emoji: "🩺" },
  hospital_militar: { label: "Hospital militar", emoji: "🪖" },
  hospital_pediatrico: { label: "Hospital pediátrico", emoji: "🧒" },
  maternidad: { label: "Maternidad / materno-infantil", emoji: "👶" },
  cdi: { label: "CDI", emoji: "🏨" },
};

export const PATIENT_CONDITION_META: Record<
  PatientCondition,
  { label: string; color: string }
> = {
  stable: { label: "Estable", color: "#16a34a" },
  serious: { label: "Grave", color: "#ea580c" },
  critical: { label: "Crítico", color: "#dc2626" },
  recovering: { label: "En recuperación", color: "#0284c7" },
  unknown: { label: "Sin determinar", color: "#64748b" },
};

export const PATIENT_STATUS_META: Record<
  PatientStatus,
  { label: string; color: string }
> = {
  hospitalized: { label: "Hospitalizado", color: "#1d4ed8" },
  discharged: { label: "Dado de alta", color: "#16a34a" },
  transferred: { label: "Transferido", color: "#7c3aed" },
  deceased: { label: "Fallecido", color: "#334155" },
};

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

export type HospitalSupplyHelpStatus =
  | "open"
  | "contacting"
  | "resolved"
  | "closed";

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
  counts: {
    red: number;
    yellow: number;
    stale: number;
    activeNeeds: number;
  };
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

export const HOSPITAL_SUPPLY_STATUSES: ReadonlySet<HospitalSupplyStatus> =
  new Set(["green", "yellow", "red", "unknown"]);

export const HOSPITAL_SUPPLY_NEED_STATUSES: ReadonlySet<HospitalSupplyNeedStatus> =
  new Set([
    "active",
    "partially_covered",
    "covered",
    "cancelled",
    "needs_verification",
  ]);

export const HOSPITAL_SUPPLY_HELP_STATUSES: ReadonlySet<HospitalSupplyHelpStatus> =
  new Set(["open", "contacting", "resolved", "closed"]);

export const ACTIVE_HOSPITAL_SUPPLY_NEED_STATUSES: ReadonlySet<HospitalSupplyNeedStatus> =
  new Set(["active", "partially_covered", "needs_verification"]);

export function isOpenHospitalSupplyHelpStatus(
  status: HospitalSupplyHelpStatus,
): boolean {
  return status === "open" || status === "contacting";
}

export const HOSPITAL_SUPPLY_CATEGORY_META: Record<
  HospitalSupplyCategory,
  {
    label: string;
    shortLabel: string;
    description: string;
    staleAfterHours: number;
    color: string;
  }
> = {
  medications: {
    label: "Medicamentos",
    shortLabel: "Medicamentos",
    description: "Medicamentos críticos, por tipo o familia terapéutica.",
    staleAfterHours: 6,
    color: "#C41A1A",
  },
  iv_fluids: {
    label: "Líquidos IV / sueros",
    shortLabel: "Sueros",
    description: "Solución fisiológica, Ringer lactato, dextrosa u otros.",
    staleAfterHours: 6,
    color: "#2B51F0",
  },
  medical_supplies: {
    label: "Insumos médicos",
    shortLabel: "Insumos",
    description: "Gasas, guantes, catéteres, jeringas y material de cura.",
    staleAfterHours: 8,
    color: "#0EA5E9",
  },
  soft_foods: {
    label: "Alimentos blandos/digeribles",
    shortLabel: "Alimentos aptos",
    description: "Comidas blandas, digeribles o aptas para pacientes.",
    staleAfterHours: 12,
    color: "#EAB308",
  },
  water: {
    label: "Agua",
    shortLabel: "Agua",
    description: "Agua potable, hielo seguro o hidratación.",
    staleAfterHours: 12,
    color: "#0EA5E9",
  },
  beds_capacity: {
    label: "Camas / capacidad",
    shortLabel: "Camas",
    description: "Capacidad operativa reportada por el hospital.",
    staleAfterHours: 6,
    color: "#16A34A",
  },
  lab_diagnostics: {
    label: "Laboratorio / diagnóstico",
    shortLabel: "Lab",
    description: "Reactivos, imagenología o soporte diagnóstico.",
    staleAfterHours: 24,
    color: "#9333EA",
  },
  transport: {
    label: "Transporte",
    shortLabel: "Transporte",
    description: "Ambulancias, traslado, combustible o movilidad.",
    staleAfterHours: 12,
    color: "#78350F",
  },
  other: {
    label: "Otro",
    shortLabel: "Otro",
    description: "Necesidad no clasificada todavía.",
    staleAfterHours: 12,
    color: "#64748B",
  },
};

export const HOSPITAL_SUPPLY_STATUS_META: Record<
  HospitalSupplyStatus,
  { label: string; description: string; color: string }
> = {
  green: {
    label: "Verde",
    description: "Sin necesidad crítica reportada.",
    color: "#16A34A",
  },
  yellow: {
    label: "Amarillo",
    description: "Requiere seguimiento o reposición próxima.",
    color: "#EAB308",
  },
  red: {
    label: "Rojo",
    description: "Necesidad urgente activa.",
    color: "#C41A1A",
  },
  unknown: {
    label: "Sin confirmar",
    description: "No hay reporte confirmado reciente.",
    color: "#64748B",
  },
};

export const HOSPITAL_SUPPLY_NEED_STATUS_META: Record<
  HospitalSupplyNeedStatus,
  { label: string; color: string }
> = {
  active: { label: "Activa", color: "#C41A1A" },
  partially_covered: { label: "Parcialmente cubierta", color: "#EAB308" },
  covered: { label: "Cubierta", color: "#16A34A" },
  cancelled: { label: "Cancelada", color: "#64748B" },
  needs_verification: { label: "Necesita verificación", color: "#9333EA" },
};

export const HOSPITAL_SUPPLY_HELP_STATUS_META: Record<
  HospitalSupplyHelpStatus,
  { label: string; color: string }
> = {
  open: { label: "Abierta", color: "#C41A1A" },
  contacting: { label: "Contactando", color: "#EAB308" },
  resolved: { label: "Resuelta", color: "#16A34A" },
  closed: { label: "Cerrada", color: "#64748B" },
};

export const MAX_SUPPLY_NOTE = 600;
export const MAX_SUPPLY_ITEM = 120;
export const MAX_SUPPLY_UNIT = 40;
export const MAX_SUPPLY_ACTOR = 120;
export const MAX_SUPPLY_HELP_MESSAGE = 500;

export function slugifyHospitalPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildHospitalSlug(
  hospital: Pick<Hospital, "name" | "municipality" | "state">,
): string {
  const parts = [
    hospital.name,
    hospital.municipality || hospital.state,
  ].filter(Boolean);

  return slugifyHospitalPart(parts.join(" ")) || "hospital";
}

export function matchesHospitalSlug(
  hospital: Pick<Hospital, "name" | "municipality" | "state">,
  slug: string,
): boolean {
  const normalized = slugifyHospitalPart(slug);
  if (!normalized) return false;

  return (
    normalized === buildHospitalSlug(hospital) ||
    normalized === slugifyHospitalPart(hospital.name) ||
    normalized ===
      slugifyHospitalPart(
        [hospital.name, hospital.municipality, hospital.state]
          .filter(Boolean)
          .join(" "),
      )
  );
}
