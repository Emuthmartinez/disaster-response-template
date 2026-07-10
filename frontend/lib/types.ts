export type ReportType =
  | "critical"
  | "supplies"
  | "shelter"
  | "nopower"
  | "missing"
  | "building"
  | "starlink";

export interface EmergencyReport {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  place: string;
  affected: number;
  needs: string;
  /** URL del endpoint que sirve la foto si el reporte tiene una, o null. */
  photoUrl: string | null;
  /** Cantidad de confirmaciones por terceros ("yo también veo esto"). */
  confirmations: number;
  createdAt: number;
}

/** Sismo del catálogo USGS. Espeja el EarthquakeDTO del backend
 * (GET /api/earthquakes). Solo campos públicos; nada de internals USGS. */
export interface Earthquake {
  id: string;
  /** Magnitud (puede ser null si USGS aún no la calculó). */
  magnitude: number | null;
  place: string;
  lat: number;
  lng: number;
  /** Profundidad en km, o null. */
  depthKm: number | null;
  /** Nivel PAGER del USGS (green|yellow|orange|red) o null. */
  alert: string | null;
  tsunami: boolean;
  /** Significancia USGS 0–1000, o null. */
  sig: number | null;
  /** Momento del sismo (epoch-ms). */
  occurredAt: number;
}

export type NewReport = Omit<
  EmergencyReport,
  "id" | "createdAt" | "photoUrl" | "confirmations"
> & {
  /** Data URL opcional con la foto del reporte. */
  photo?: string | null;
};

export const REPORT_TYPES: Record<
  ReportType,
  {
    label: string;
    color: string;
    /** Emoji circular usado en la leyenda, lista y marcadores. */
    emoji: string;
    /** Icono semántico usado en la selección del formulario. */
    icon: string;
    description: string;
  }
> = {
  critical: {
    label: "Emergencia Crítica",
    color: "#dc2626",
    emoji: "🔴",
    icon: "🆘",
    description:
      "Personas atrapadas, heridos de gravedad o colapso estructural inminente. Prioridad máxima de rescate.",
  },
  supplies: {
    label: "Suministros",
    color: "#eab308",
    emoji: "🟡",
    icon: "📦",
    description:
      "Zonas seguras pero con necesidad urgente de suministros (falta de agua, comida, cobijo o primeros auxilios).",
  },
  shelter: {
    label: "Centro de Acopio / Refugio",
    color: "#16a34a",
    emoji: "🟢",
    icon: "🏠",
    description:
      "Punto verificado y habilitado para recibir donaciones físicas o resguardar familias (Refugio seguro).",
  },
  nopower: {
    label: "Zona estable (sin electricidad)",
    color: "#0ea5e9",
    emoji: "🔵",
    icon: "💡",
    description:
      "Zona sin daños graves y segura, pero sin servicio eléctrico (y posiblemente sin señal). Útil para saber qué sectores están bien.",
  },
  missing: {
    label: "Se busca (persona)",
    color: "#9333ea",
    emoji: "🟣",
    icon: "🔍",
    description:
      "Búsqueda de una persona desaparecida. Indica su última ubicación conocida y una descripción para ayudar a localizarla.",
  },
  building: {
    label: "Edificación",
    color: "#78350f",
    emoji: "🟤",
    icon: "🏢",
    description:
      "Registro fotográfico del estado de un edificio o construcción. Útil para que ingenieros y autoridades evalúen daños estructurales.",
  },
  starlink: {
    label: "Antena Starlink",
    color: "#0f172a",
    emoji: "⚫",
    icon: "🛰️",
    description:
      "Punto con antena Starlink o internet satelital disponible para la comunidad. Indica la ubicación exacta y si el acceso es público.",
  },
};

export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES) as ReportType[];

/** Capas del mapa público (sin emergencia crítica). */
export const MAP_REPORT_TYPE_KEYS = REPORT_TYPE_KEYS.filter(
  (key): key is ReportType => key !== "critical",
);

/** Persona desaparecida o encontrada. Duplicado entre AdminDashboard y MissingPersonDetail. */
export interface MissingPerson {
  id: string;
  name: string;
  age: number | null;
  nationality?: string;
  description: string;
  lastSeen: string;
  contact: string;
  photoUrl: string | null;
  status?: "active" | "found";
  resolutionNote?: string | null;
  resolutionPhotoUrl?: string | null;
  resolvedAt?: number | null;
  createdAt: number;
}
