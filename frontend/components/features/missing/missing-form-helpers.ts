import type { MissingReportType, FoundPlace, PersonStatus } from "./types";

import {
  fileToResizedDataUrl as resizePhoto,
  MISSING_PHOTO_MAX_DIM,
} from "@/lib/image-resize";

export const NATIONALITY_OPTIONS = [
  "Venezolana",
  "Colombiana",
  "Peruana",
  "Ecuatoriana",
  "Chilena",
  "Argentina",
  "Brasileña",
  "Cubana",
  "Española",
  "Otra",
];

export function fileToResizedDataUrl(file: File): Promise<string> {
  return resizePhoto(file, MISSING_PHOTO_MAX_DIM);
}

export function formatLastSeen(
  location: string,
  lastContactAt: string,
  reportType: MissingReportType,
  foundPlace?: FoundPlace,
): string {
  const loc = location.trim();
  let base = loc;
  if (reportType === "found" && foundPlace) {
    const prefix =
      foundPlace === "hospital" ? "En un hospital" : "En la calle";
    base = loc ? `${prefix}: ${loc}` : prefix;
  }
  if (!lastContactAt.trim()) return base;
  const d = new Date(lastContactAt);
  if (Number.isNaN(d.getTime())) return base;
  const when = d.toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const suffix =
    reportType === "found"
      ? `Encontrada el ${when}`
      : `Sin contacto desde ${when}`;
  return base ? `${base} · ${suffix}` : suffix;
}

export function buildDescription(
  description: string,
  reportType: MissingReportType,
  personStatus?: PersonStatus,
): string {
  const text = description.trim();
  if (reportType !== "found" || !personStatus) return text;
  const statusLabel =
    personStatus === "safe" ? "Estado: A salvo." : "Estado: Fallecida.";
  return text ? `${statusLabel} ${text}` : statusLabel;
}
