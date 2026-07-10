import { REPORT_TYPES, type EmergencyReport } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

type LatLng = { lat: number; lng: number };

/** Enlace profundo a un punto del mapa (lat/lng): abre el mapa centrado ahí.
 * `EmergencyApp` lee `lat`/`lng` al cargar para volar hasta el punto. */
export function shareUrl(point: LatLng): string {
  const origin = typeof window !== "undefined" ? window.location.origin : SITE_URL;
  const params = new URLSearchParams({
    lat: point.lat.toFixed(5),
    lng: point.lng.toFixed(5),
  });
  return `${origin}/?${params.toString()}#mapa`;
}

export function reportShareUrl(
  report: Pick<EmergencyReport, "lat" | "lng">,
): string {
  return shareUrl(report);
}

/** Texto humano para compartir un reporte, sin el enlace (lo añade el destino). */
export function reportShareText(report: EmergencyReport): string {
  const meta = REPORT_TYPES[report.type];
  const parts = [`${meta.emoji} ${meta.label}: ${report.place}`];
  if (report.needs.trim()) parts.push(report.needs.trim());
  return parts.join(" — ");
}
