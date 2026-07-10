/**
 * Service de geocodificación vía Nominatim (OpenStreetMap). Port de
 * app/api/geocode/route.ts, preservando el sesgo opcional por viewbox y el
 * reordenamiento de resultados dentro de la caja.
 *
 * El edge-cache de Next (next.revalidate) no aplica en Express; el Cache-Control
 * de la respuesta (en el route) cubre el CDN. (ponytail: sin cache interno.)
 */
import { badGateway } from "@/lib/errors";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

// Tamaño aproximado de la "caja" alrededor del punto de sesgo (en grados).
// ~0.8° lat ≈ 88 km, ~1.0° lon ≈ 105 km en latitudes medias (varía con la
// latitud real del despliegue).
const BIAS_LAT_DELTA = 0.8;
const BIAS_LNG_DELTA = 1.0;
const NOMINATIM_TIMEOUT_MS = 8_000;

// Restringe Nominatim a uno o más países (csv de códigos ISO 3166-1 alpha-2,
// ej. "ve" o "ve,co"). OPCIONAL: sin GEOCODE_COUNTRY_CODES, busca sin
// restricción de país (ningún default atado a un país real de este template).
const GEOCODE_COUNTRY_CODES = (process.env.GEOCODE_COUNTRY_CODES ?? "").trim();

export async function geocode(
  query: string,
  bias: { lat: number; lng: number } | null,
): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  if (GEOCODE_COUNTRY_CODES) url.searchParams.set("countrycodes", GEOCODE_COUNTRY_CODES);
  url.searchParams.set("limit", "8");
  url.searchParams.set("accept-language", "es");

  if (bias) {
    // viewbox = left,top,right,bottom (lon_min,lat_max,lon_max,lat_min).
    // bounded=0: prefiere resultados dentro de la caja sin descartar el resto.
    const left = bias.lng - BIAS_LNG_DELTA;
    const right = bias.lng + BIAS_LNG_DELTA;
    const top = bias.lat + BIAS_LAT_DELTA;
    const bottom = bias.lat - BIAS_LAT_DELTA;
    url.searchParams.set("viewbox", `${left},${top},${right},${bottom}`);
    url.searchParams.set("bounded", "0");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
      headers: {
        "User-Agent": "DisasterResponseTemplate/1.0 (https://example.org)",
        "Accept-Language": "es",
      },
    });
  } catch {
    throw badGateway("No se pudo buscar la dirección.");
  }

  if (!res.ok) {
    throw badGateway("No se pudo buscar la dirección.");
  }

  const data = (await res.json()) as NominatimResult[];
  let results: GeocodeResult[] = data.map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name,
  }));

  // Con sesgo activo, subimos los resultados dentro de la caja al principio
  // (conservando el orden de relevancia de Nominatim dentro de cada grupo).
  if (bias) {
    const inBox = (r: { lat: number; lng: number }) =>
      Math.abs(r.lat - bias.lat) <= BIAS_LAT_DELTA &&
      Math.abs(r.lng - bias.lng) <= BIAS_LNG_DELTA;
    results = results
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const ai = inBox(a.r) ? 0 : 1;
        const bi = inBox(b.r) ? 0 : 1;
        return ai - bi || a.i - b.i;
      })
      .map(({ r }) => r)
      .slice(0, 6);
  } else {
    results = results.slice(0, 6);
  }

  return results;
}
