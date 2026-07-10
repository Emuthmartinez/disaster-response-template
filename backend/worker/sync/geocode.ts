/**
 * Geocodificación de ubicaciones (`last_seen`) -> lat/lng, para que los
 * registros sincronizados aparezcan como marcadores en el mapa.
 *
 * Usa Nominatim (OpenStreetMap) con caché en `geocode_cache` para no repetir
 * llamadas. Respeta el límite de Nominatim (~1 req/s) y va ACOTADO por cantidad
 * y por tiempo, para correr dentro del presupuesto serverless desde un cron.
 *
 * Porta la lógica de scripts/geocode-missing-locations.mjs. Ver RFC §4.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, hasDbEnv, schema } from "../../src/db";

const { geocodeCache } = schema;

/**
 * Centro aproximado de la zona de cobertura, para sesgar los resultados de
 * Nominatim. SIN default real: configura GEOCODE_BIAS_LAT/LNG para tu zona (o
 * déjalo así — sin sesgo — si tu despliegue cubre una región amplia).
 */
const BIAS = {
  lat: Number(process.env.GEOCODE_BIAS_LAT || 0),
  lng: Number(process.env.GEOCODE_BIAS_LNG || 0),
};
const DEFAULT_DELAY_MS = 1100; // Nominatim: máx ~1 req/s
const DEFAULT_MAX_LOCATIONS = 20;
const DEFAULT_TIME_BUDGET_MS = 200_000;
const USER_AGENT = "DisasterResponseTemplate/1.0 (geocode)";
// País a acotar la búsqueda (ISO 3166-1 alpha-2, ej. "ve"). OPCIONAL: sin
// GEOCODE_COUNTRY_CODE busca sin restricción de país.
const COUNTRY_CODE = (process.env.GEOCODE_COUNTRY_CODE || "").trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GeocodeResult {
  /** Ubicaciones únicas consideradas en esta corrida. */
  locations: number;
  /** Geocodificadas por primera vez (llamada a Nominatim). */
  geocodedNew: number;
  /** Resueltas desde la caché. */
  fromCache: number;
  /** Sin resultado en Nominatim. */
  failed: number;
  /** Personas a las que se les propagó lat/lng. */
  peopleUpdated: number;
}

interface Coords {
  lat: number;
  lng: number;
  label: string;
}

// Sufijo opcional de país en el texto de búsqueda (ej. "Ruritania"), para
// desambiguar direcciones cortas. SIN default real.
const COUNTRY_NAME_SUFFIX = (process.env.GEOCODE_COUNTRY_NAME || "").trim();
const HAS_BIAS = Boolean(process.env.GEOCODE_BIAS_LAT && process.env.GEOCODE_BIAS_LNG);

async function geocodeLocation(query: string): Promise<Coords | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set(
    "q",
    COUNTRY_NAME_SUFFIX ? `${query}, ${COUNTRY_NAME_SUFFIX}` : query,
  );
  if (COUNTRY_CODE) url.searchParams.set("countrycodes", COUNTRY_CODE);
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "es");
  if (HAS_BIAS) {
    url.searchParams.set(
      "viewbox",
      `${BIAS.lng - 1},${BIAS.lat + 0.8},${BIAS.lng + 1},${BIAS.lat - 0.8}`,
    );
    url.searchParams.set("bounded", "0");
  }

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: data[0].display_name ?? query };
}

export interface GeocodeOptions {
  /** Máximo de ubicaciones únicas por corrida. */
  maxLocations?: number;
  /** Pausa entre llamadas a Nominatim (ms). */
  delayMs?: number;
  /** Presupuesto de tiempo (ms): se corta al excederlo. */
  timeBudgetMs?: number;
}

/**
 * Geocodifica las ubicaciones activas sin coordenadas (las más frecuentes
 * primero) y propaga lat/lng a todas las personas con esa misma ubicación.
 * Acotado: solo procesa hasta `maxLocations` o hasta agotar `timeBudgetMs`.
 */
export async function runGeocode(
  opts: GeocodeOptions = {},
): Promise<GeocodeResult> {
  if (!hasDbEnv()) {
    throw new Error("runGeocode requiere DATABASE_URL.");
  }
  const maxLocations = Math.min(
    Math.max(Math.trunc(opts.maxLocations ?? DEFAULT_MAX_LOCATIONS), 1),
    500,
  );
  const delayMs = Math.max(0, Math.trunc(opts.delayMs ?? DEFAULT_DELAY_MS));
  const timeBudgetMs = Math.max(1_000, Math.trunc(opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS));
  const startedAt = Date.now();

  const db = getDb();

  // Ubicaciones activas sin coordenadas, agrupadas por clave normalizada y
  // ordenadas por frecuencia. El builder no expresa bien lower(trim())/GROUP BY
  // con ORDER BY count(*), así que se usa SQL crudo preservando la semántica.
  const locations = (
    await db.execute(sql`
      SELECT lower(trim(last_seen)) AS key, min(last_seen) AS sample
      FROM missing_persons
      WHERE status = 'active' AND trim(last_seen) <> '' AND lat IS NULL
      GROUP BY lower(trim(last_seen))
      ORDER BY count(*) DESC
      LIMIT ${maxLocations}
    `)
  ).rows as { key: string; sample: string }[];

  const result: GeocodeResult = {
    locations: locations.length,
    geocodedNew: 0,
    fromCache: 0,
    failed: 0,
    peopleUpdated: 0,
  };

  for (const { key, sample } of locations) {
    if (!key) continue;
    if (Date.now() - startedAt >= timeBudgetMs) break;

    const cacheRows = await db
      .select({
        lat: geocodeCache.lat,
        lng: geocodeCache.lng,
        label: geocodeCache.label,
      })
      .from(geocodeCache)
      .where(eq(geocodeCache.normalizedKey, key));
    let coords: Coords | null = cacheRows[0] ?? null;

    if (coords) {
      result.fromCache++;
    } else {
      await sleep(delayMs);
      coords = await geocodeLocation(sample);
      if (!coords) {
        result.failed++;
        continue;
      }
      await db
        .insert(geocodeCache)
        .values({
          normalizedKey: key,
          lat: coords.lat,
          lng: coords.lng,
          label: coords.label,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: geocodeCache.normalizedKey,
          set: {
            lat: coords.lat,
            lng: coords.lng,
            label: coords.label,
            updatedAt: Date.now(),
          },
        });
      result.geocodedNew++;
    }

    // UPDATE con lower(trim()) en el WHERE: SQL crudo para preservar la
    // semántica de coincidencia por clave normalizada.
    const updated = (
      await db.execute(sql`
        UPDATE missing_persons SET lat = ${coords.lat}, lng = ${coords.lng}
        WHERE status = 'active' AND lower(trim(last_seen)) = ${key} AND lat IS NULL
        RETURNING id
      `)
    ).rows as { id: string }[];
    result.peopleUpdated += updated.length;
  }

  return result;
}
