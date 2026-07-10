import { deploymentConfig } from "@/lib/deployment-config";

/** Formato numérico local (según config/deployment.config.json → languageTag)
 *  para contadores y estadísticas. */
export function formatLocaleNumber(value: number): string {
  return value.toLocaleString(deploymentConfig.languageTag);
}

/** Devuelve una etiqueta relativa corta ("ahora", "hace 5 min", "hace 2 h", "hace 3 d"). */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const s = Math.round(diff / 1000);
  if (s < 30) return "ahora mismo";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

/** Distancia aproximada entre dos puntos lat/lng en metros (Haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Clase de color para indicar frescura del reporte. */
export function freshnessClass(ts: number, now: number = Date.now()): string {
  const ageMs = Math.max(0, now - ts);
  if (ageMs < 60 * 60 * 1000) return "text-emerald-600"; // <1h
  if (ageMs < 24 * 60 * 60 * 1000) return "text-sky-600"; // <24h
  return "text-slate-400"; // viejo
}
