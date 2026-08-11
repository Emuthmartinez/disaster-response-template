/**
 * DTOs de la superficie de insumos hospitalarios — espejo de lo que devuelve
 * `api/public/hospital-supplies` (backend/src/services/hospitals.ts). Solo los
 * campos que el panel usa; el backend es la fuente de verdad.
 */

export type SupplyCategory =
  | "medications"
  | "iv_fluids"
  | "medical_supplies"
  | "soft_foods"
  | "water"
  | "beds_capacity"
  | "lab_diagnostics"
  | "transport"
  | "other";

export type SupplyStatusValue = "green" | "yellow" | "red" | "unknown";

export type SupplyNeedStatus =
  | "active"
  | "partially_covered"
  | "covered"
  | "cancelled"
  | "needs_verification";

export type SupplyHelpStatus = "open" | "contacting" | "resolved" | "closed";

export interface SupplyFreshness {
  lastUpdatedAt: number;
  lastConfirmedAt: number;
  staleAfterHours: number;
  isStale: boolean;
  updatedAgo: string;
  confirmedAgo: string;
}

export interface SupplyStatusRow {
  id: string;
  hospitalId: string;
  category: SupplyCategory;
  status: SupplyStatusValue;
  label: string;
  publicNote: string;
  restrictedNote: string;
  updatedBy: string;
  source: string;
  freshness: SupplyFreshness;
}

export interface SupplyNeedRow {
  id: string;
  hospitalId: string;
  category: SupplyCategory;
  categoryLabel: string;
  itemType: string;
  quantity: number | null;
  unit: string;
  urgency: SupplyStatusValue;
  status: SupplyNeedStatus;
  publicNote: string;
  restrictedNote: string;
  updatedBy: string;
  source: string;
  updatedAgo: string;
}

export interface SupplyHelpRow {
  id: string;
  hospitalId: string;
  category: SupplyCategory;
  categoryLabel: string;
  message: string;
  urgency: SupplyStatusValue;
  status: SupplyHelpStatus;
  requestedBy: string;
  source: string;
  restrictedNote: string;
  updatedAgo: string;
}

export interface SupplyPocRow {
  id: string;
  displayName: string;
  role: "operator_admin" | "hospital_poc" | "ops_reader";
  restrictedContact: string;
  active: boolean;
}

export interface SupplySummary {
  counts: { red: number; yellow: number; stale: number; activeNeeds: number };
  worstStatus: SupplyStatusValue;
  lastConfirmedAt: number | null;
}

export interface SupplySnapshot {
  hospitalId: string;
  summary: SupplySummary;
  statuses: SupplyStatusRow[];
  activeNeeds: SupplyNeedRow[];
  helpRequests: SupplyHelpRow[];
  pocs: SupplyPocRow[];
}

export interface SupplyHospital {
  id: string;
  name: string;
  facilityType: string;
  state: string;
  municipality: string;
  priorityZone: "P0" | "P1" | "P2" | "P3";
}

export interface SupplyBoardRow {
  hospital: SupplyHospital;
  supply: SupplySnapshot;
}

export interface SupplyBoard {
  generatedAt: number;
  stats: {
    hospitals: number;
    redCategories: number;
    yellowCategories: number;
    staleCategories: number;
    activeNeeds: number;
    helpOpen: number;
  };
  hospitals: SupplyBoardRow[];
}

export interface SupplyEventRow {
  id: string;
  category: string | null;
  entityType: string;
  action: string;
  actor: string;
  source: string;
  createdAt: number;
}

// --- Etiquetas (es) para selects; el backend ya devuelve labels en los DTOs ---

export const CATEGORY_LABELS: Record<SupplyCategory, string> = {
  medications: "Medicamentos",
  iv_fluids: "Líquidos IV / sueros",
  medical_supplies: "Insumos médicos",
  soft_foods: "Alimentos blandos",
  water: "Agua",
  beds_capacity: "Camas / capacidad",
  lab_diagnostics: "Laboratorio / diagnóstico",
  transport: "Transporte",
  other: "Otros",
};

export const STATUS_LABELS: Record<SupplyStatusValue, string> = {
  green: "Verde (cubierto)",
  yellow: "Amarillo (limitado)",
  red: "Rojo (crítico)",
  unknown: "Sin datos",
};

export const NEED_STATUS_LABELS: Record<SupplyNeedStatus, string> = {
  active: "Activa",
  partially_covered: "Parcialmente cubierta",
  covered: "Cubierta",
  cancelled: "Cancelada",
  needs_verification: "Por verificar",
};

export const HELP_STATUS_LABELS: Record<SupplyHelpStatus, string> = {
  open: "Abierta",
  contacting: "En contacto",
  resolved: "Resuelta",
  closed: "Cerrada",
};

export const STATUS_DOT: Record<SupplyStatusValue, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-600",
  unknown: "bg-gray-300",
};
