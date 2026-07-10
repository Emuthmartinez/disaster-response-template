/** Escala de severidad de daño estructural. Single source of truth para
 * marcadores, popup y leyenda de reportes de usuario con severidad. */

export type Severity = 1 | 2 | 3 | 4;

export interface SeverityMeta {
  label: string;
  /** Color de relleno del marcador. */
  color: string;
  /** Borde más oscuro: da contraste sobre el mapa y aporta el "no solo color"
   * (el amarillo #eab308 falla AA sobre blanco, por eso el borde oscuro). */
  stroke: string;
  /** Color de texto accesible (AA) para usar la severidad como etiqueta. */
  text: string;
  emoji: string;
  /** Radio del circleMarker: a mayor severidad, marcador más grande. Es un
   * indicador de forma adicional al color (a11y: no depender solo del color). */
  radius: number;
}

export const SEVERITY: Record<Severity, SeverityMeta> = {
  1: {
    label: "Leve",
    color: "#22c55e",
    stroke: "#15803d",
    text: "#15803d",
    emoji: "🟢",
    radius: 5,
  },
  2: {
    label: "Moderado",
    color: "#eab308",
    stroke: "#a16207",
    text: "#a16207",
    emoji: "🟡",
    radius: 6,
  },
  3: {
    label: "Severo",
    color: "#f97316",
    stroke: "#c2410c",
    text: "#c2410c",
    emoji: "🟠",
    radius: 7,
  },
  4: {
    label: "Colapsado",
    color: "#dc2626",
    stroke: "#991b1b",
    text: "#b91c1c",
    emoji: "🔴",
    radius: 8,
  },
};

export const SEVERITY_LEVELS: Severity[] = [1, 2, 3, 4];

/** Devuelve la metadata de severidad, con fallback a "Leve" si el valor es
 * inesperado. */
export function severityMeta(value: number): SeverityMeta {
  return SEVERITY[value as Severity] ?? SEVERITY[1];
}

/** Mapea la magnitud de un sismo (escala Richter/Mw) a la escala de severidad
 * 1–4, para reutilizar los mismos colores/emoji que la capa de edificios.
 * Umbrales: <3 leve · 3–4 moderado · 4–5 severo · ≥5 colapsado. `null` (USGS
 * aún sin magnitud) cae en "Leve". */
export function magnitudeSeverity(magnitude: number | null): Severity {
  if (magnitude === null || magnitude < 3) return 1;
  if (magnitude < 4) return 2;
  if (magnitude < 5) return 3;
  return 4;
}
