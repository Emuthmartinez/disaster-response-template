/**
 * Config de la federación con un hub central de otros sitios socios (RFC 0002).
 * Módulo OFF por defecto (gating, ver AGENTS.md del backend): sin
 * ENABLE_HUB_FEDERATION=true, ni el scheduler ni los workers hub-ingest/
 * hub-images se registran (ver worker/queues.ts + worker/index.ts).
 *
 * Catálogo CERRADO de 5 tipos, su tabla destino, y el mapeo de su DTO de lectura
 * (`*Public`) a nuestras columnas `hub_*`. La ingesta es READ-ONLY (GET abierto,
 * sin API key). Excluimos NUESTRAS propias `source` para no re-ingerir lo que ya
 * publicamos (bucle de eco).
 */

/** true solo con ENABLE_HUB_FEDERATION=true (por defecto OFF). */
export const HUB_FEDERATION_ENABLED = process.env.ENABLE_HUB_FEDERATION === "true";

/**
 * Falla fuerte si el flag está encendido pero falta configuración obligatoria.
 * Llamar al arrancar el worker (antes de registrar schedulers/workers) para
 * morir con un mensaje accionable en vez de un 404/fetch-failed silencioso.
 */
export function assertHubFederationConfigured(): void {
  if (!HUB_FEDERATION_ENABLED) return;
  if (!process.env.HUB_BASE_URL) {
    throw new Error(
      "ENABLE_HUB_FEDERATION=true requiere HUB_BASE_URL (URL del hub central). " +
        "Ejemplo: HUB_BASE_URL=https://hub.example.org",
    );
  }
}

/** URL base del hub. Lanza si no está configurada — llamar solo tras el assert de arriba. */
export function getHubBaseUrl(): string {
  const base = process.env.HUB_BASE_URL;
  if (!base) {
    throw new Error(
      "HUB_BASE_URL no configurada (requerida cuando ENABLE_HUB_FEDERATION=true). " +
        "Ejemplo: HUB_BASE_URL=https://hub.example.org",
    );
  }
  return base.replace(/\/$/, "");
}

export const HUB_PAGE_LIMIT = Number(process.env.HUB_PAGE_LIMIT || 200); // máx del hub

/**
 * `source`s que somos NOSOTROS. Cualquier registro del hub con una de estas
 * fuentes se descarta al ingerir (ya está en nuestras tablas nativas). SIN
 * default (ningún dominio real embebido): configura tus propios `source` ids
 * por env (csv), ej. HUB_OWN_SOURCES=example.org,example.org2026.
 */
export const OWN_SOURCES: ReadonlySet<string> = new Set(
  (process.env.HUB_OWN_SOURCES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isOwnSource(source: string | null | undefined): boolean {
  return OWN_SOURCES.has((source || "").trim().toLowerCase());
}

/** Los 5 tipos del catálogo del hub. */
export type HubType =
  | "missing_person"
  | "checkin"
  | "help_request"
  | "help_offer"
  | "damaged_building";

export const HUB_TYPES: HubType[] = [
  "missing_person",
  "checkin",
  "help_request",
  "help_offer",
  "damaged_building",
];

/** Tabla destino por tipo (nombre físico en Postgres). */
export const HUB_TABLE: Record<HubType, string> = {
  missing_person: "hub_missing_persons",
  checkin: "hub_checkins",
  help_request: "hub_help_requests",
  help_offer: "hub_help_offers",
  damaged_building: "hub_damaged_buildings",
};

/** Tipos que traen foto (necesitan copia a R2). */
export const HUB_HAS_PHOTO: Record<HubType, boolean> = {
  missing_person: true,
  checkin: true,
  help_request: false,
  help_offer: false,
  damaged_building: true,
};

/** Forma cruda de un registro del hub (campos que usamos; el resto se ignora). */
export interface HubRecord {
  id: string; // uuid del hub (hub_id)
  source?: string | null;
  external_id?: string | null;
  source_url?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  photo_url?: string | null;
  // específicos por tipo:
  name?: string | null;
  status?: string | null;
  message?: string | null;
  place_name?: string | null;
  category?: string | null;
  description?: string | null;
  urgency?: string | null;
  availability?: string | null;
  available?: boolean | null;
  severity?: string | null;
}

export interface HubPage {
  reports: HubRecord[];
  next_cursor: string | null;
}

/**
 * Mapea un HubRecord a las columnas de su tabla `hub_*` (sin las de control:
 * id, ingested_at, updated_at, photo_url/migrated/broken las pone el job).
 * Devuelve un objeto columna->valor; los campos que la tabla no tenga se omiten
 * vía el set de columnas por tipo en hubIngest.
 */
export function mapRecord(type: HubType, r: HubRecord): Record<string, unknown> {
  const common = {
    hub_id: r.id,
    source: r.source ?? "",
    external_id: r.external_id ?? null,
    city: r.city ?? null,
    lat: r.latitude ?? null,
    lng: r.longitude ?? null,
    hub_created_at: r.created_at ?? null,
  };
  switch (type) {
    case "missing_person":
    case "checkin":
      return {
        ...common,
        name: r.name ?? "",
        status: r.status ?? null,
        message: r.message ?? null,
        place_name: r.place_name ?? null,
        photo_external_url: r.photo_url ?? null,
      };
    case "help_request":
      return {
        ...common,
        category: r.category ?? null,
        description: r.description ?? null,
        urgency: r.urgency ?? null,
        status: r.status ?? null,
        place_name: r.place_name ?? null,
      };
    case "help_offer":
      return {
        ...common,
        category: r.category ?? null,
        description: r.description ?? null,
        availability: r.availability ?? null,
        available: r.available ?? null,
      };
    case "damaged_building":
      return {
        ...common,
        place_name: r.place_name ?? null,
        name: r.name ?? null,
        description: r.description ?? null,
        severity: r.severity ?? null,
        photo_external_url: r.photo_url ?? null,
      };
  }
}

/** Trae una página del hub para un tipo. `cursor` = next_cursor anterior (o null). */
export async function fetchHubPage(
  type: HubType,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<HubPage> {
  let url = `${getHubBaseUrl()}/api/v1/reports?type=${type}&limit=${HUB_PAGE_LIMIT}`;
  if (cursor) url += `&since=${encodeURIComponent(cursor)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": HUB_USER_AGENT },
    signal,
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") || 5);
    const err = new Error(`hub 429 (retry-after ${retry}s)`) as Error & { retryAfter: number };
    err.retryAfter = retry;
    throw err;
  }
  if (!res.ok) throw new Error(`hub GET ${type} -> ${res.status}`);
  const body = (await res.json()) as HubPage;
  return { reports: body.reports || [], next_cursor: body.next_cursor ?? null };
}

export const HUB_USER_AGENT =
  process.env.HUB_USER_AGENT ||
  "DisasterResponseTemplate/1.0 (+https://example.org)";
