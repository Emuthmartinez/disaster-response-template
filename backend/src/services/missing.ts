/**
 * Service de personas desaparecidas. La LÓGICA y las consultas viven aquí (no en
 * el route). Portado desde lib/missing.ts del app Next previo, preservando el
 * comportamiento EXACTO y devolviendo SIEMPRE DTOs por allowlist (rowToPerson) —
 * nunca la fila de DB cruda (jamás se expone `photo`/`resolution_photo` ni
 * `ip_hash`, solo URLs derivadas /api/missing/:id/photo).
 *
 * Diferencia con el app Next: NO hay fallback en memoria. El backend SIEMPRE
 * corre con DATABASE_URL (validado en config/env). Las ramas `hasDbEnv()` del
 * lib previo colapsan a la rama de DB.
 */
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  deleteR2Url,
  getObject,
  isR2Url,
  keyFromR2Url,
  persistPhotoDataUrl,
} from "@/lib/r2";
import { isAllowedImageDataUrl, parseImageDataUri } from "@/lib/image";
import { invalidate } from "@/lib/cache";

const { missingPersons, missingPersonSuppressions } = schema;

/**
 * Normaliza el resultado de `getDb().execute()` a un arreglo de filas. El driver
 * neon-http devuelve el arreglo directo; node-postgres devuelve `{ rows }`.
 */
function execRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export type MissingStatus = "active" | "found";

/** Registro de persona desaparecida tal como se expone al cliente (sin la foto embebida). */
export interface MissingDTO {
  id: string;
  name: string;
  age: number | null;
  nationality: string;
  description: string;
  lastSeen: string;
  contact: string;
  /** URL del endpoint que sirve la foto, o null si no hay foto. */
  photoUrl: string | null;
  status: MissingStatus;
  /** Texto que comparte quien marca a la persona como localizada. */
  resolutionNote: string | null;
  /** URL del endpoint que sirve la foto-prueba de la resolución, si hay. */
  resolutionPhotoUrl: string | null;
  resolvedAt: number | null;
  createdAt: number;
}

/** Marcador ligero para el mapa (sin cargar toda la ficha). */
export interface MissingMapMarker {
  id: string;
  name: string;
  age: number | null;
  nationality: string;
  lastSeen: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface MissingStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
}

export type MissingReportType = "missing" | "found";

export interface CreateInput {
  name: string;
  age?: number | string | null;
  nationality?: string | null;
  description?: string;
  lastSeen?: string;
  contact?: string;
  /** Data URL de la foto (data:image/...;base64,...). Opcional. */
  photo?: string | null;
  /** Reporte de persona desaparecida (activa) o encontrada (localizada). */
  reportType?: MissingReportType;
}

export const MAX_NAME = 120;
export const MAX_NATIONALITY = 80;
export const MAX_DESCRIPTION = 600;
export const MAX_LAST_SEEN = 200;
export const MAX_CONTACT = 120;
/** Límite del data URL de la foto (~1.4 MB en base64 ≈ 1 MB de imagen). */
export const MAX_PHOTO_CHARS = 1_400_000;
export const MAX_RESOLUTION_NOTE = 600;

/** Tamaño de página por defecto y máximo permitido para el listado paginado. */
export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 100;

/**
 * Mínimo de caracteres por término de búsqueda. El índice GIN de trigramas no
 * puede servir términos de <3 caracteres (haría un seq scan completo).
 */
export const MIN_SEARCH_LEN = 3;
/** Tope del conteo de resultados de búsqueda (se muestra "500+"). */
export const SEARCH_COUNT_CAP = 500;
/** Cap del conteo SIN búsqueda (listado por status). Ver lib/missing.ts. */
export const LIST_COUNT_CAP = 100_000;

/**
 * Indica si la búsqueda acento-insensitiva (unaccent + pg_trgm) está disponible.
 * Detectamos (una vez, cacheado) si el índice `idx_missing_search` existe. Si no,
 * se cae a ILIKE sobre las columnas crudas (sensible a acentos).
 */
let _accentSearchReady: Promise<boolean> | null = null;
function accentSearchReady(): Promise<boolean> {
  if (!_accentSearchReady) {
    _accentSearchReady = (async () => {
      try {
        const db = await getDb();
        const res = await db.execute(
          sql`SELECT to_regclass('public.idx_missing_search') AS oid`,
        );
        const rows = execRows<{ oid: string | null }>(res);
        return Boolean(rows[0]?.oid);
      } catch {
        return false;
      }
    })();
  }
  return _accentSearchReady;
}

// Tipo de fila tal como sale del builder para las columnas que seleccionamos
// (has_photo / has_resolution_photo se derivan en SQL, no son columnas reales).
type Row = {
  id: string;
  name: string;
  age: number | null;
  nationality: string | null;
  description: string;
  last_seen: string;
  contact: string;
  has_photo: boolean;
  photo_external_url: string | null;
  status: string | null;
  resolution_note: string | null;
  has_resolution_photo: boolean;
  resolved_at: string | number | null;
  created_at: string | number;
};

/** URL del endpoint de foto cuando hay bytes en DB o URL externa pendiente. */
function missingPhotoApiUrl(
  id: string,
  row: Pick<Row, "has_photo" | "photo_external_url">,
): string | null {
  if (row.has_photo) return `/api/missing/${id}/photo`;
  const ext = row.photo_external_url?.trim();
  return ext ? `/api/missing/${id}/photo` : null;
}

/** Allowlist de salida: fila DB -> DTO público. Mismo mapeo que lib/missing.ts. */
function rowToPerson(row: Row): MissingDTO {
  const photoUrl = missingPhotoApiUrl(row.id, row);
  return {
    id: row.id,
    name: row.name,
    age: row.age === null ? null : Number(row.age),
    nationality: row.nationality ?? "",
    description: row.description,
    lastSeen: row.last_seen,
    contact: row.contact,
    photoUrl,
    status: (row.status === "found" ? "found" : "active") as MissingStatus,
    resolutionNote: row.resolution_note ?? null,
    resolutionPhotoUrl: row.has_resolution_photo
      ? `/api/missing/${row.id}/resolution-photo`
      : null,
    resolvedAt: row.resolved_at !== null ? Number(row.resolved_at) : null,
    createdAt: Number(row.created_at),
  };
}

function normalizeAge(age: CreateInput["age"]): number | null {
  if (age === null || age === undefined || age === "") return null;
  const n = Math.trunc(Number(age));
  if (!Number.isFinite(n) || n < 0 || n > 130) return null;
  return n;
}

/** Valida que la cadena sea un data URL de imagen soportada (ver lib/image.ts). */
export function isValidPhotoDataUrl(photo: string): boolean {
  return isAllowedImageDataUrl(photo);
}

export type MissingStatusFilter = "active" | "found" | "all";

export interface ListMissingPageParams {
  status?: MissingStatusFilter;
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface MissingPageResult {
  people: MissingDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** true si `total` se truncó en el cap del conteo (mostrar "N+"). */
  totalCapped: boolean;
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Palabras de búsqueda en minúsculas (sin patrones), máx. 8. Se descartan los
 * términos de menos de `MIN_SEARCH_LEN` caracteres (el trigram no los indexa).
 */
function searchTerms(search: string | undefined): string[] {
  return (search ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= MIN_SEARCH_LEN)
    .slice(0, 8);
}

/**
 * Listado paginado con búsqueda server-side. Paginación por offset construyendo
 * el WHERE dinámicamente: sin término de búsqueda no se agrega predicado, de modo
 * que `idx_missing_status_created` sirve el orden + LIMIT; cada término es un
 * ILIKE explícito que el índice GIN de trigramas puede usar. SQL crudo porque el
 * WHERE/ORDER se arma dinámico y usa f_unaccent/ILIKE. Semántica idéntica a la
 * de lib/missing.ts:listMissingPage.
 */
export async function listMissingPage(
  params: ListMissingPageParams = {},
): Promise<MissingPageResult> {
  const status = params.status ?? "active";
  const pageSize = clampInt(params.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const requestedPage = clampInt(params.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const rawTerms = searchTerms(params.search);

  const db = await getDb();
  const useAccent = await accentSearchReady();

  const conditions: ReturnType<typeof sql>[] = [];

  if (status !== "all") {
    conditions.push(sql`status = ${status}`);
  }

  const fieldExpr = useAccent
    ? sql`f_unaccent(name || ' ' || last_seen || ' ' || coalesce(description, ''))`
    : sql`lower(name || ' ' || last_seen || ' ' || coalesce(description, ''))`;
  // Con acentos disponibles comparamos contra el texto sin acentos en ambos
  // lados; en el fallback respetamos el texto crudo (sensible a acentos).
  const terms = useAccent ? rawTerms.map(stripAccents) : rawTerms;
  for (const term of terms) {
    conditions.push(sql`${fieldExpr} ILIKE ${`%${term}%`}`);
  }

  const whereSql = conditions.length
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;
  const orderSql =
    status === "found"
      ? sql`COALESCE(resolved_at, created_at) DESC, id DESC`
      : sql`created_at DESC, id DESC`;

  const hasSearch = terms.length > 0;
  const cap = hasSearch ? SEARCH_COUNT_CAP : LIST_COUNT_CAP;
  const countQuery = sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM missing_persons ${whereSql} LIMIT ${cap}) t`;

  // Conteo y página independientes → en paralelo (la latencia es el MAX, no la
  // suma). Offset calculado con requestedPage directo; si excede el total,
  // devuelve vacío (evita el waterfall).
  const offset = (requestedPage - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    db.execute(countQuery),
    db.execute(
      sql`SELECT id, name, age, description, last_seen, contact,
                 (photo IS NOT NULL) AS has_photo,
                 photo_external_url,
                 status,
                 resolution_note,
                 (resolution_photo IS NOT NULL) AS has_resolution_photo,
                 resolved_at, created_at
          FROM missing_persons ${whereSql} ORDER BY ${orderSql} LIMIT ${pageSize} OFFSET ${offset}`,
    ),
  ]);
  const total = execRows<{ n: number }>(countRes)[0]?.n ?? 0;
  const totalCapped = total >= cap;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = execRows<Row>(listRes);

  return { people: rows.map(rowToPerson), total, page, pageSize, totalPages, totalCapped };
}

/** Lista COMPLETA (sin paginar) para el panel admin. includeFound=true trae
 *  también las localizadas. DTO allowlist (rowToPerson) — sin fotos crudas. */
export async function listMissing(
  options: { includeFound?: boolean } = {},
): Promise<MissingDTO[]> {
  const db = await getDb();
  const whereSql = options.includeFound ? sql`` : sql`WHERE status = 'active'`;
  const res = await db.execute(
    sql`SELECT id, name, age, nationality, description, last_seen, contact,
               (photo IS NOT NULL) AS has_photo,
               photo_external_url,
               status,
               resolution_note,
               (resolution_photo IS NOT NULL) AS has_resolution_photo,
               resolved_at, created_at
        FROM missing_persons ${whereSql}
        ORDER BY created_at DESC, id DESC`,
  );
  return execRows<Row>(res).map(rowToPerson);
}

export async function addMissing(input: CreateInput): Promise<MissingDTO> {
  const id = crypto.randomUUID();
  const name = (input.name ?? "").trim().slice(0, MAX_NAME);
  const age = normalizeAge(input.age);
  const nationality = (input.nationality ?? "").trim().slice(0, MAX_NATIONALITY);
  const description = (input.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  const lastSeen = (input.lastSeen ?? "").trim().slice(0, MAX_LAST_SEEN);
  const contact = (input.contact ?? "").trim().slice(0, MAX_CONTACT);
  const photo =
    typeof input.photo === "string" && input.photo ? input.photo : null;
  const createdAt = Date.now();
  const isFound = input.reportType === "found";
  const status: MissingStatus = isFound ? "found" : "active";
  const resolutionNote = isFound ? description : null;
  const resolvedAt = isFound ? createdAt : null;

  // Si R2 está configurado, la foto va al CDN; si falla, base64 en DB.
  let stored = photo;
  let migratedAt: number | null = null;
  if (photo) {
    ({ stored, migratedAt } = await persistPhotoDataUrl(
      photo,
      "missing_persons",
      id,
    ));
  }

  const db = await getDb();
  await db.insert(missingPersons).values({
    id,
    name,
    age,
    nationality,
    description,
    lastSeen,
    contact,
    photo: stored,
    photoMigratedAt: migratedAt,
    createdAt,
    status,
    resolutionNote,
    resolvedAt,
  });
  invalidate();

  return {
    id,
    name,
    age,
    nationality,
    description,
    lastSeen,
    contact,
    photoUrl: photo ? `/api/missing/${id}/photo` : null,
    status,
    resolutionNote,
    resolutionPhotoUrl: null,
    resolvedAt,
    createdAt,
  };
}

/**
 * Marca a una persona como localizada agregando una nota obligatoria y una
 * foto-prueba opcional. Devuelve el registro actualizado o null si no existía.
 */
export async function markMissingFound(
  id: string,
  note: string,
  resolutionPhoto: string | null,
): Promise<MissingDTO | null> {
  const cleanNote = note.trim().slice(0, MAX_RESOLUTION_NOTE);
  if (!cleanNote) throw new Error("Falta la descripción de cómo se comunicaron.");
  const validPhoto =
    resolutionPhoto && isValidPhotoDataUrl(resolutionPhoto) ? resolutionPhoto : null;
  const resolvedAt = Date.now();
  // Foto-prueba a R2 cuando está configurado; fallback base64 si falla.
  let photo = validPhoto;
  if (validPhoto) {
    ({ stored: photo } = await persistPhotoDataUrl(validPhoto, "resolution", id));
  }

  // El builder de update().set().where().returning() no resuelve sobre el tipo
  // unión de drivers; usamos el escape `sql` preservando la semántica exacta.
  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_persons
        SET status = 'found',
            resolution_note = ${cleanNote},
            resolution_photo = ${photo},
            resolved_at = ${resolvedAt}
        WHERE id = ${id} AND COALESCE(status, 'active') = 'active'
        RETURNING id, name, age, nationality, description, last_seen, contact,
                  (photo IS NOT NULL) AS has_photo,
                  photo_external_url,
                  COALESCE(status, 'active') AS status,
                  resolution_note,
                  (resolution_photo IS NOT NULL) AS has_resolution_photo,
                  resolved_at,
                  created_at`,
  );
  const rows = execRows<Row>(result);
  if (rows.length > 0) invalidate();
  return rows.length > 0 ? rowToPerson(rows[0]!) : null;
}

export async function restoreMissing(id: string): Promise<boolean> {
  // Escape `sql` por el tipo unión de drivers. Misma semántica que el UPDATE ...
  // RETURNING id previo.
  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_persons
        SET status = 'active',
            resolution_note = NULL,
            resolution_photo = NULL,
            resolved_at = NULL
        WHERE id = ${id} AND COALESCE(status, 'active') = 'found'
        RETURNING id`,
  );
  const restored = execRows<{ id: string }>(result).length > 0;
  if (restored) invalidate();
  return restored;
}

export interface PhotoData {
  contentType: string;
  buffer: Buffer;
}

/** La foto está alojada externamente; el endpoint debe redirigir a esta URL. */
export interface RemotePhoto {
  redirectTo: string;
}

function dataUrlToPhoto(dataUrl: string | null): PhotoData | null {
  if (!dataUrl) return null;
  // Usa el parser central: rechaza subtipos no permitidos (svg/gif).
  const parsed = parseImageDataUri(dataUrl);
  if (!parsed) return null;
  return { contentType: parsed.contentType, buffer: parsed.bytes };
}

const MAX_PHOTO_FETCH_BYTES = 15 * 1024 * 1024;

async function fetchExternalPhoto(url: string): Promise<PhotoData | null> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "DisasterResponseTemplatePhotoProxy/1.0 (+https://example.org)",
    },
  });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > MAX_PHOTO_FETCH_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PHOTO_FETCH_BYTES) return null;
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  return { contentType, buffer: buf };
}

/**
 * Devuelve la foto de una persona. Sirve bytes desde base64, R2 o fetch externo.
 * Null si no existe o la fuente remota no responde.
 */
export async function getMissingPhoto(
  id: string,
): Promise<PhotoData | RemotePhoto | null> {
  const db = await getDb();
  const rows = await db
    .select({
      photo: missingPersons.photo,
      photoExternalUrl: missingPersons.photoExternalUrl,
    })
    .from(missingPersons)
    .where(eq(missingPersons.id, id));
  const stored = rows[0]?.photo ?? null;
  const externalUrl = rows[0]?.photoExternalUrl ?? null;
  if (stored) {
    if (/^https?:\/\//i.test(stored)) {
      // URL de R2 → proxy (fetch server-side en vez de 302 a URL privada).
      // Si getObject falla (objeto eliminado/expirado) igual redirigimos
      // (asumimos que el CDN sirve 404 él mismo), en vez de caer en
      // dataUrlToPhoto que espera un data-URI y fallaría silenciosamente.
      if (isR2Url(stored)) {
        const obj = await getObject(keyFromR2Url(stored));
        if (obj) return obj;
        return { redirectTo: stored };
      }
      return { redirectTo: stored };
    }
    return dataUrlToPhoto(stored);
  }
  if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
    const proxied = await fetchExternalPhoto(externalUrl);
    if (proxied) return proxied;
  }
  return null;
}

/** Foto-prueba que se subió al marcar a la persona como localizada. */
export async function getMissingResolutionPhoto(
  id: string,
): Promise<PhotoData | RemotePhoto | null> {
  const db = await getDb();
  const rows = await db
    .select({ resolutionPhoto: missingPersons.resolutionPhoto })
    .from(missingPersons)
    .where(eq(missingPersons.id, id));
  const dataUrl = rows[0]?.resolutionPhoto ?? null;
  if (dataUrl && /^https?:\/\//i.test(dataUrl)) {
    // URL de R2 → proxy (fetch server-side en vez de 302 a URL privada)
    if (isR2Url(dataUrl)) {
      const obj = await getObject(keyFromR2Url(dataUrl));
      if (obj) return obj;
    }
    return { redirectTo: dataUrl };
  }
  return dataUrlToPhoto(dataUrl);
}

export async function removeMissing(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({
      source: missingPersons.source,
      externalId: missingPersons.externalId,
      photo: missingPersons.photo,
      photoExternalUrl: missingPersons.photoExternalUrl,
      resolutionPhoto: missingPersons.resolutionPhoto,
    })
    .from(missingPersons)
    .where(eq(missingPersons.id, id));
  const row = rows[0];

  if (!row) {
    const suppression = await db
      .select({ legacyId: missingPersonSuppressions.legacyId })
      .from(missingPersonSuppressions)
      .where(eq(missingPersonSuppressions.legacyId, id));
    return suppression.length > 0;
  }

  await db
    .insert(missingPersonSuppressions)
    .values({
      legacyId: id,
      source: row.source,
      externalId: row.externalId,
      reason: "admin_delete",
      createdAt: Date.now(),
    })
    .onConflictDoNothing();

  for (const url of [row.photo, row.photoExternalUrl, row.resolutionPhoto]) {
    if (url) await deleteR2Url(url);
  }

  const result = await db.execute(
    sql`DELETE FROM missing_persons WHERE id = ${id} RETURNING id`,
  );
  const removed = execRows<{ id: string }>(result).length > 0;
  if (removed) invalidate();
  return removed;
}

/** Devuelve una persona por id como DTO (allowlist, rowToPerson), o null. */
export async function getMissingById(id: string): Promise<MissingDTO | null> {
  const db = await getDb();
  const res = await db.execute(
    sql`SELECT id, name, age, nationality, description, last_seen, contact,
               (photo IS NOT NULL) AS has_photo,
               photo_external_url,
               status,
               resolution_note,
               (resolution_photo IS NOT NULL) AS has_resolution_photo,
               resolved_at, created_at
        FROM missing_persons WHERE id = ${id}`,
  );
  const rows = execRows<Row>(res);
  return rows.length > 0 ? rowToPerson(rows[0]!) : null;
}

/** Campos editables de la ficha (no se permite mover id/createdAt/status/foto). */
export interface UpdateMissingInput {
  name?: string;
  age?: number | string | null;
  nationality?: string;
  description?: string;
  lastSeen?: string;
  contact?: string;
}

/**
 * Actualiza campos permitidos de la ficha de una persona. Recorta/clampa con los
 * mismos límites que addMissing. Devuelve el DTO actualizado o null si no existe.
 * Escape `sql` por el tipo unión de drivers (igual que markMissingFound).
 */
export async function updateMissing(
  id: string,
  input: UpdateMissingInput,
): Promise<MissingDTO | null> {
  const sets: ReturnType<typeof sql>[] = [];
  if (input.name !== undefined)
    sets.push(sql`name = ${input.name.trim().slice(0, MAX_NAME)}`);
  if (input.age !== undefined) sets.push(sql`age = ${normalizeAge(input.age)}`);
  if (input.nationality !== undefined)
    sets.push(sql`nationality = ${input.nationality.trim().slice(0, MAX_NATIONALITY)}`);
  if (input.description !== undefined)
    sets.push(sql`description = ${input.description.trim().slice(0, MAX_DESCRIPTION)}`);
  if (input.lastSeen !== undefined)
    sets.push(sql`last_seen = ${input.lastSeen.trim().slice(0, MAX_LAST_SEEN)}`);
  if (input.contact !== undefined)
    sets.push(sql`contact = ${input.contact.trim().slice(0, MAX_CONTACT)}`);
  if (sets.length === 0) return getMissingById(id);

  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_persons SET ${sql.join(sets, sql`, `)}
        WHERE id = ${id}
        RETURNING id, name, age, nationality, description, last_seen, contact,
                  (photo IS NOT NULL) AS has_photo,
                  photo_external_url,
                  COALESCE(status, 'active') AS status,
                  resolution_note,
                  (resolution_photo IS NOT NULL) AS has_resolution_photo,
                  resolved_at, created_at`,
  );
  const rows = execRows<Row>(result);
  if (rows.length > 0) invalidate();
  return rows.length > 0 ? rowToPerson(rows[0]!) : null;
}

/** Totales consolidados para el panel del mapa y el hero. */
export async function countMissingStats(): Promise<MissingStats> {
  const db = await getDb();
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) FILTER (WHERE ${missingPersons.status} = 'active')::int`,
      found: sql<number>`count(*) FILTER (WHERE ${missingPersons.status} = 'found')::int`,
      on_map: sql<number>`count(*) FILTER (
        WHERE ${missingPersons.status} = 'active' AND ${missingPersons.lat} IS NOT NULL AND ${missingPersons.lng} IS NOT NULL
      )::int`,
    })
    .from(missingPersons);
  const row = rows[0] ?? { total: 0, active: 0, found: 0, on_map: 0 };
  return {
    total: Number(row.total),
    active: Number(row.active),
    found: Number(row.found),
    onMap: Number(row.on_map),
  };
}

export interface ListMissingMapParams {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  limit?: number;
}

type MapRow = {
  id: string;
  name: string;
  age: number | null;
  nationality: string | null;
  last_seen: string;
  has_photo: boolean;
  photo_external_url: string | null;
  lat: number;
  lng: number;
  created_at: string | number;
};

/** Marcadores de desaparecidos activos con coordenadas (viewport opcional). */
export async function listMissingMapMarkers(
  params: ListMissingMapParams = {},
): Promise<MissingMapMarker[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 500), 1), 2000);

  const conditions: ReturnType<typeof sql>[] = [
    sql`status = 'active'`,
    sql`lat IS NOT NULL`,
    sql`lng IS NOT NULL`,
  ];

  const { north, south, east, west } = params;
  if (
    north !== undefined &&
    south !== undefined &&
    east !== undefined &&
    west !== undefined &&
    Number.isFinite(north) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(west)
  ) {
    conditions.push(
      sql`lat BETWEEN ${Math.min(south, north)} AND ${Math.max(south, north)}`,
    );
    conditions.push(
      sql`lng BETWEEN ${Math.min(west, east)} AND ${Math.max(west, east)}`,
    );
  }

  const db = await getDb();
  const res = await db.execute(
    sql`SELECT id, name, age, nationality, last_seen,
               (photo IS NOT NULL) AS has_photo,
               photo_external_url,
               lat, lng, created_at
        FROM missing_persons
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
  );
  const rows = execRows<MapRow>(res);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    age: row.age === null ? null : Number(row.age),
    nationality: row.nationality ?? "",
    lastSeen: row.last_seen,
    photoUrl: missingPhotoApiUrl(row.id, row),
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: Number(row.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Sincronización de fuentes externas (ver docs/rfcs/0001-sincronizacion-fuentes.md)
// Portado desde lib/missing.ts del app Next previo, preservando el comportamiento
// EXACTO. El motor de sync (worker/sync) escribe SOLO por este camino único.
// ---------------------------------------------------------------------------

/**
 * Registro normalizado que produce cada adaptador de fuente. Forma canónica;
 * estructuralmente compatible con `ExternalPerson` de worker/sync/types.ts (el
 * motor pasa esos objetos directo). Definido aquí para no acoplar src/ a worker/.
 */
export interface ExternalMissingInput {
  externalId: string;
  source: string;
  sourceUrl?: string | null;
  name: string;
  age?: number | null;
  lastSeen?: string | null;
  description?: string | null;
  contact?: string | null;
  photoUrl?: string | null;
  status: MissingStatus;
  resolutionNote?: string | null;
  /** epoch ms */
  resolvedAt?: number | null;
  /** epoch ms */
  createdAt?: number | null;
  /** epoch ms */
  updatedAt?: number | null;
}

function clipText(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  return s.length > max ? s.slice(0, max) : s;
}

export interface BatchUpsertResult {
  inserted: number;
  updated: number;
  /** Registros descartados por inválidos (sin source/externalId/name). */
  skipped: number;
  /** Registros en lotes que fallaron al escribir. */
  errors: number;
}

const DEFAULT_BATCH_SIZE = 1000;
const MAX_BATCH_SIZE = 4000;

/** Columnas del INSERT de registros externos (orden fijo, alineado con los valores). */
const EXTERNAL_COLS = [
  "id", "name", "age", "description", "last_seen", "contact",
  "photo_external_url", "external_id", "source", "source_url",
  "status", "resolution_note", "resolved_at", "created_at",
] as const;

/** Cláusula DO UPDATE: misma semántica que el upsert de una fila. */
const CONFLICT_UPDATE_SET = `
  name = EXCLUDED.name,
  age = EXCLUDED.age,
  description = EXCLUDED.description,
  last_seen = EXCLUDED.last_seen,
  contact = EXCLUDED.contact,
  photo_external_url = COALESCE(missing_persons.photo_external_url, EXCLUDED.photo_external_url),
  source = COALESCE(missing_persons.source, EXCLUDED.source),
  source_url = COALESCE(missing_persons.source_url, EXCLUDED.source_url),
  status = EXCLUDED.status,
  resolution_note = COALESCE(EXCLUDED.resolution_note, missing_persons.resolution_note),
  resolved_at = COALESCE(EXCLUDED.resolved_at, missing_persons.resolved_at)`;

/**
 * Prepara los valores de una fila a partir de un registro externo. El
 * `external_id` se guarda CRUDO; la unicidad es por (source, external_id) — ver
 * índice compuesto en infra/db/schema.ts. Devuelve null si el registro es
 * inválido (sin source/externalId/name) para que el caller lo cuente como
 * saltado.
 */
function buildExternalRow(
  input: ExternalMissingInput,
): { key: string; values: unknown[] } | null {
  const externalId = (input.externalId ?? "").trim();
  const source = clipText(input.source, 120);
  const name = clipText(input.name, MAX_NAME);
  if (!externalId || !source || !name) return null;

  const status: MissingStatus = input.status === "found" ? "found" : "active";
  // El contacto solo llega si el adaptador decidió importarlo (ver RFC §6).
  const values: unknown[] = [
    crypto.randomUUID(),
    name,
    normalizeAge(input.age),
    clipText(input.description, MAX_DESCRIPTION),
    clipText(input.lastSeen, MAX_LAST_SEEN),
    clipText(input.contact, MAX_CONTACT),
    typeof input.photoUrl === "string" && /^https?:\/\//i.test(input.photoUrl)
      ? input.photoUrl.slice(0, 600)
      : null,
    externalId,
    source,
    typeof input.sourceUrl === "string" ? input.sourceUrl.slice(0, 300) : null,
    status,
    status === "found" && input.resolutionNote
      ? clipText(input.resolutionNote, MAX_RESOLUTION_NOTE) || null
      : null,
    status === "found" ? (input.resolvedAt ?? Date.now()) : null,
    input.createdAt ?? Date.now(),
  ];
  return { key: JSON.stringify([source, externalId]), values };
}

/**
 * Camino ÚNICO de escritura para registros de fuentes externas. Inserta/actualiza
 * por lotes (INSERT multi-fila + ON CONFLICT (source, external_id)), idempotente:
 * re-correr no duplica, solo actualiza los campos que cambian.
 *
 * Deduplica por (source, external_id) quedándose con el último, porque Postgres
 * falla si una misma clave aparece dos veces en el mismo ON CONFLICT (el feed
 * vivo + paginación por offset produce solapes). Ver ADR 0002.
 *
 * Se mantiene SQL crudo (getDb().execute) porque arma un INSERT multi-fila
 * dinámico con ON CONFLICT sobre un índice parcial (WHERE external_id IS NOT
 * NULL) y RETURNING (xmax = 0); el query builder no expresa el predicado del
 * índice parcial ni el xmax de forma directa. Semántica idéntica a la previa.
 */
export async function upsertExternalMissingBatch(
  people: ExternalMissingInput[],
  opts: { batchSize?: number } = {},
): Promise<BatchUpsertResult> {
  const result: BatchUpsertResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const batchSize = Math.min(
    Math.max(Math.trunc(opts.batchSize ?? DEFAULT_BATCH_SIZE), 1),
    MAX_BATCH_SIZE,
  );

  const db = await getDb();
  const suppressionRows = await db
    .select({
      source: missingPersonSuppressions.source,
      externalId: missingPersonSuppressions.externalId,
    })
    .from(missingPersonSuppressions);
  const suppressedKeys = new Set(
    suppressionRows.flatMap(({ source, externalId }) =>
      source && externalId ? [JSON.stringify([source, externalId])] : [],
    ),
  );

  const byKey = new Map<string, unknown[]>();
  for (const person of people) {
    const row = buildExternalRow(person);
    if (!row) {
      result.skipped++;
      continue;
    }
    if (suppressedKeys.has(row.key)) {
      result.skipped++;
      continue;
    }
    byKey.set(row.key, row.values);
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) return result;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const tuples = chunk.map(
      (values) => sql`(${sql.join(values.map((v) => sql`${v}`), sql`,`)})`,
    );
    const query = sql`INSERT INTO missing_persons (${sql.raw(EXTERNAL_COLS.join(", "))}) VALUES ${sql.join(tuples, sql`,`)} ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET${sql.raw(CONFLICT_UPDATE_SET)} RETURNING (xmax = 0) AS inserted`;
    try {
      const out = await db.execute(query);
      for (const r of execRows<{ inserted: boolean }>(out)) {
        if (r.inserted) result.inserted++;
        else result.updated++;
      }
    } catch {
      result.errors += chunk.length;
    }
  }
  if (result.inserted > 0 || result.updated > 0) invalidate();
  return result;
}
