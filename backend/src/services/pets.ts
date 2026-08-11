/**
 * Service de mascotas desaparecidas/encontradas. Sigue el patrón canónico del
 * backend: route (HTTP) → service (lógica/DB) → db, devolviendo SIEMPRE DTOs por
 * allowlist (`rowToPet`) y nunca la fila cruda — igual que `services/missing.ts`.
 *
 * QUÉ ES Y QUÉ NO ES
 * ------------------
 * Es CRUD sobre `missing_pets` y nada más. NO tiene —a propósito— motor de
 * fuentes externas, tabla de supresiones, federación de hub ni worker de rehost
 * de fotos. `missing_persons` sí los tiene; copiarlos aquí "por simetría" crearía
 * una segunda implementación de maquinaria sensible a concurrencia que nadie
 * ejercita y que se pudre en silencio. Si algún día existe un feed real de
 * mascotas, se diseña entonces.
 *
 * POR QUÉ NO REUTILIZA `services/missing.ts`
 * ------------------------------------------
 * Porque `missing_persons` es la tabla más caliente de un sitio en producción que
 * la gente usa para buscar a su familia, y este fichero se escribió para NO
 * tocarla. Refactorizar helpers compartidos habría metido cambios en la ruta de
 * personas a cambio de ahorrar ~40 líneas. El duplicado (execRows, la detección
 * de acentos, clampInt) es deliberado y está acotado.
 *
 * OJO AL MANTENER: si arreglas un bug en la lógica núcleo de `services/missing.ts`
 * (búsqueda, marcar localizada, borrado de fotos en R2), MIRA si `missing_pets`
 * necesita el mismo arreglo. Son primos, no la misma cosa.
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

const { missingPets } = schema;

/**
 * Normaliza el resultado de `getDb().execute()` a un arreglo de filas: el driver
 * neon-http (Workers) devuelve el arreglo directo y node-postgres devuelve
 * `{ rows }`. Duplicado de services/missing.ts a propósito (ver cabecera).
 */
function execRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export type PetStatus = "active" | "found";
export type PetReportType = "missing" | "found";

/** Ficha de mascota tal como se expone al cliente (sin la foto embebida). */
export interface PetDTO {
  id: string;
  /** Puede ir vacío: quien encuentra un animal rara vez sabe su nombre. */
  name: string;
  species: string;
  breed: string;
  color: string;
  sex: PetSex | null;
  age: number | null;
  description: string;
  lastSeen: string;
  contact: string;
  /**
   * El NÚMERO de microchip nunca sale de la base. Solo se dice si hay uno, para
   * que quien reclame la mascota pueda ser verificado contra un dato que no está
   * publicado. Ver `infra/db/schema.ts` → missing_pets.microchip.
   */
  hasMicrochip: boolean;
  photoUrl: string | null;
  status: PetStatus;
  resolutionNote: string | null;
  resolutionPhotoUrl: string | null;
  resolvedAt: number | null;
  createdAt: number;
}

/** Marcador ligero para el mapa (sin cargar toda la ficha). */
export interface PetMapMarker {
  id: string;
  name: string;
  species: string;
  breed: string;
  lastSeen: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface PetStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
}

/** Sexo del animal. `null`/desconocido es el caso NORMAL en un hallazgo. */
export const PET_SEXES = ["macho", "hembra", "desconocido"] as const;
export type PetSex = (typeof PET_SEXES)[number];

/**
 * Especies con tratamiento propio en la UI. `otro` es la válvula de escape: en un
 * terremoto la gente busca gallinas, caballos y loros, y rechazar el reporte por
 * no estar en una lista cerrada sería perder información útil.
 */
export const PET_SPECIES = ["perro", "gato", "ave", "otro"] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export interface CreatePetInput {
  name?: string;
  species?: string | null;
  breed?: string | null;
  color?: string | null;
  sex?: string | null;
  age?: number | string | null;
  description?: string;
  lastSeen?: string;
  contact?: string;
  microchip?: string | null;
  /** Data URL de la foto (data:image/...;base64,...). Opcional. */
  photo?: string | null;
  /** Reporte de mascota perdida (activa) o encontrada (resuelta al crearse). */
  reportType?: PetReportType;
  /**
   * Coordenadas de la zona, si el cliente consiguió geocodificarla. Opcionales a
   * propósito: un reporte SIN coordenadas es válido y sale igual en el directorio,
   * solo que no en el mapa. Perder el reporte por no poder geolocalizarlo sería
   * mucho peor que no pintar un pin.
   */
  lat?: number | null;
  lng?: number | null;
}

/** Descarta coordenadas imposibles (y NaN). Fuera de rango => sin coordenada, no error. */
function normalizeCoord(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

export const MAX_NAME = 120;
export const MAX_SPECIES = 40;
export const MAX_BREED = 80;
export const MAX_COLOR = 80;
export const MAX_DESCRIPTION = 600;
export const MAX_LAST_SEEN = 200;
export const MAX_CONTACT = 120;
export const MAX_MICROCHIP = 40;
/** Límite del data URL de la foto (~1.4 MB en base64 ≈ 1 MB de imagen). */
export const MAX_PHOTO_CHARS = 1_400_000;
export const MAX_RESOLUTION_NOTE = 600;

/** Edad máxima en años. Un loro gris puede pasar de 50; 120 cubre cualquier caso. */
const MAX_AGE_YEARS = 120;

export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 100;

/** Mínimo de caracteres por término de búsqueda (igual que en personas). */
export const MIN_SEARCH_LEN = 3;
export const SEARCH_COUNT_CAP = 500;
export const LIST_COUNT_CAP = 100_000;

/**
 * ¿Está disponible la búsqueda acento-insensitiva? Se detecta (una vez, cacheado)
 * si existe `f_unaccent`, la función que crea la extensión `unaccent`. Si no, se
 * cae a `lower()` + ILIKE (sensible a acentos), que siempre funciona.
 *
 * A diferencia de `services/missing.ts` NO se comprueba un índice: `missing_pets`
 * no tiene índice de trigramas y no lo necesita al volumen esperado (los reportes
 * de mascotas son órdenes de magnitud menos que los de personas, y el filtro por
 * `status` ya usa `idx_pets_status_created`). Si el volumen crece, el arreglo es
 * un GIN de trigramas, no cambiar este código.
 */
let _accentSearchReady: Promise<boolean> | null = null;
function accentSearchReady(): Promise<boolean> {
  if (!_accentSearchReady) {
    _accentSearchReady = (async () => {
      try {
        const db = await getDb();
        const res = await db.execute(
          sql`SELECT to_regprocedure('public.f_unaccent(text)') AS oid`,
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

/** Fila tal como sale del SELECT (has_photo/has_microchip se derivan en SQL). */
type Row = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  color: string | null;
  sex: string | null;
  age: number | null;
  description: string;
  last_seen: string;
  contact: string;
  has_microchip: boolean;
  has_photo: boolean;
  status: string | null;
  resolution_note: string | null;
  has_resolution_photo: boolean;
  resolved_at: string | number | null;
  created_at: string | number;
};

/** Columnas del SELECT público. Una sola definición: si se añade una columna a la
 *  tabla, NO aparece sola en las respuestas — hay que meterla aquí y en el DTO. */
const SELECT_COLS = sql`id, name, species, breed, color, sex, age, description,
         last_seen, contact,
         (microchip IS NOT NULL AND microchip <> '') AS has_microchip,
         (photo IS NOT NULL) AS has_photo,
         COALESCE(status, 'active') AS status,
         resolution_note,
         (resolution_photo IS NOT NULL) AS has_resolution_photo,
         resolved_at, created_at`;

function normalizeSex(sex: unknown): PetSex | null {
  if (typeof sex !== "string") return null;
  const s = sex.trim().toLowerCase();
  return (PET_SEXES as readonly string[]).includes(s) ? (s as PetSex) : null;
}

/** Allowlist de salida: fila DB -> DTO público. */
function rowToPet(row: Row): PetDTO {
  return {
    id: row.id,
    name: row.name,
    species: row.species ?? "",
    breed: row.breed ?? "",
    color: row.color ?? "",
    sex: normalizeSex(row.sex),
    age: row.age === null ? null : Number(row.age),
    description: row.description,
    lastSeen: row.last_seen,
    contact: row.contact,
    hasMicrochip: Boolean(row.has_microchip),
    photoUrl: row.has_photo ? `/api/pets/${row.id}/photo` : null,
    status: (row.status === "found" ? "found" : "active") as PetStatus,
    resolutionNote: row.resolution_note ?? null,
    resolutionPhotoUrl: row.has_resolution_photo
      ? `/api/pets/${row.id}/resolution-photo`
      : null,
    resolvedAt: row.resolved_at !== null ? Number(row.resolved_at) : null,
    createdAt: Number(row.created_at),
  };
}

function normalizeAge(age: CreatePetInput["age"]): number | null {
  if (age === null || age === undefined || age === "") return null;
  const n = Math.trunc(Number(age));
  if (!Number.isFinite(n) || n < 0 || n > MAX_AGE_YEARS) return null;
  return n;
}

/** Valida que la cadena sea un data URL de imagen soportada (ver lib/image.ts). */
export function isValidPhotoDataUrl(photo: string): boolean {
  return isAllowedImageDataUrl(photo);
}

export type PetStatusFilter = "active" | "found" | "all";

export interface ListPetsPageParams {
  status?: PetStatusFilter;
  page?: number;
  pageSize?: number;
  search?: string;
  /** Filtro por especie. `undefined` = todas. */
  species?: string;
}

export interface PetPageResult {
  pets: PetDTO[];
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

function searchTerms(search: string | undefined): string[] {
  return (search ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= MIN_SEARCH_LEN)
    .slice(0, 8);
}

/**
 * Listado paginado con búsqueda server-side. El WHERE se arma dinámico: sin
 * término de búsqueda no se añade predicado y `idx_pets_status_created` sirve el
 * orden + LIMIT. La búsqueda cubre nombre, especie, raza, color, zona y
 * descripción — buscar "labrador negro" tiene que encontrar al perro aunque nadie
 * haya escrito su nombre.
 */
export async function listPetsPage(
  params: ListPetsPageParams = {},
): Promise<PetPageResult> {
  const status = params.status ?? "active";
  const pageSize = clampInt(params.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const requestedPage = clampInt(params.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const rawTerms = searchTerms(params.search);

  const db = await getDb();
  const useAccent = await accentSearchReady();

  const conditions: ReturnType<typeof sql>[] = [];

  if (status !== "all") {
    conditions.push(sql`COALESCE(status, 'active') = ${status}`);
  }

  const species = (params.species ?? "").trim().toLowerCase();
  if (species) {
    conditions.push(sql`lower(species) = ${species}`);
  }

  const haystack = sql`name || ' ' || coalesce(species, '') || ' ' || coalesce(breed, '')
       || ' ' || coalesce(color, '') || ' ' || last_seen || ' ' || coalesce(description, '')`;
  const fieldExpr = useAccent
    ? sql`f_unaccent(${haystack})`
    : sql`lower(${haystack})`;
  // Con unaccent disponible comparamos texto sin acentos en AMBOS lados; en el
  // fallback se respeta el texto crudo (sensible a acentos).
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
  const countQuery = sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM missing_pets ${whereSql} LIMIT ${cap}) t`;

  // Conteo y página son independientes → en paralelo (la latencia es el MAX, no
  // la suma). Mismo criterio que el listado de personas.
  const offset = (requestedPage - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    db.execute(countQuery),
    db.execute(
      sql`SELECT ${SELECT_COLS}
          FROM missing_pets ${whereSql} ORDER BY ${orderSql} LIMIT ${pageSize} OFFSET ${offset}`,
    ),
  ]);
  const total = execRows<{ n: number }>(countRes)[0]?.n ?? 0;
  const totalCapped = total >= cap;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = execRows<Row>(listRes);

  return { pets: rows.map(rowToPet), total, page, pageSize, totalPages, totalCapped };
}

/** Lista COMPLETA (sin paginar) para el panel admin / integraciones. */
export async function listPets(
  options: { includeFound?: boolean } = {},
): Promise<PetDTO[]> {
  const db = await getDb();
  const whereSql = options.includeFound
    ? sql``
    : sql`WHERE COALESCE(status, 'active') = 'active'`;
  const res = await db.execute(
    sql`SELECT ${SELECT_COLS}
        FROM missing_pets ${whereSql}
        ORDER BY created_at DESC, id DESC`,
  );
  return execRows<Row>(res).map(rowToPet);
}

export async function addPet(input: CreatePetInput): Promise<PetDTO> {
  const id = crypto.randomUUID();
  const name = (input.name ?? "").trim().slice(0, MAX_NAME);
  const species = (input.species ?? "").trim().toLowerCase().slice(0, MAX_SPECIES);
  const breed = (input.breed ?? "").trim().slice(0, MAX_BREED);
  const color = (input.color ?? "").trim().slice(0, MAX_COLOR);
  const sex = normalizeSex(input.sex);
  const age = normalizeAge(input.age);
  const description = (input.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  const lastSeen = (input.lastSeen ?? "").trim().slice(0, MAX_LAST_SEEN);
  const contact = (input.contact ?? "").trim().slice(0, MAX_CONTACT);
  const microchipRaw = (input.microchip ?? "").trim().slice(0, MAX_MICROCHIP);
  const microchip = microchipRaw || null;
  const photo =
    typeof input.photo === "string" && input.photo ? input.photo : null;
  const lat = normalizeCoord(input.lat, 90);
  const lng = normalizeCoord(input.lng, 180);
  const createdAt = Date.now();
  const isFound = input.reportType === "found";
  const status: PetStatus = isFound ? "found" : "active";
  // Un reporte "la encontré" nace resuelto, igual que en personas: la nota de
  // resolución es la descripción que dio quien la encontró.
  const resolutionNote = isFound ? description : null;
  const resolvedAt = isFound ? createdAt : null;

  // Si R2 está configurado la foto va al CDN; si falla, base64 en DB (no se
  // pierde el reporte por un fallo de almacenamiento).
  let stored = photo;
  let migratedAt: number | null = null;
  if (photo) {
    ({ stored, migratedAt } = await persistPhotoDataUrl(photo, "missing_pets", id));
  }

  const db = await getDb();
  await db.insert(missingPets).values({
    id,
    name,
    species,
    breed,
    color,
    sex,
    age,
    description,
    lastSeen,
    contact,
    microchip,
    photo: stored,
    photoMigratedAt: migratedAt,
    lat,
    lng,
    createdAt,
    status,
    resolutionNote,
    resolvedAt,
  });
  invalidate();

  return {
    id,
    name,
    species,
    breed,
    color,
    sex,
    age,
    description,
    lastSeen,
    contact,
    hasMicrochip: Boolean(microchip),
    photoUrl: photo ? `/api/pets/${id}/photo` : null,
    status,
    resolutionNote,
    resolutionPhotoUrl: null,
    resolvedAt,
    createdAt,
  };
}

/**
 * Marca una mascota como reunida con su familia, con nota obligatoria y
 * foto-prueba. Devuelve la ficha actualizada o null si no existía o ya estaba
 * resuelta. Se usa el escape `sql` porque el builder de update().returning() no
 * resuelve sobre el tipo unión de los dos drivers (igual que en personas).
 */
export async function markPetFound(
  id: string,
  note: string,
  resolutionPhoto: string | null,
): Promise<PetDTO | null> {
  const cleanNote = note.trim().slice(0, MAX_RESOLUTION_NOTE);
  if (!cleanNote) throw new Error("Falta la descripción de cómo apareció.");
  const validPhoto =
    resolutionPhoto && isValidPhotoDataUrl(resolutionPhoto) ? resolutionPhoto : null;
  const resolvedAt = Date.now();
  let photo = validPhoto;
  if (validPhoto) {
    ({ stored: photo } = await persistPhotoDataUrl(validPhoto, "pet-resolution", id));
  }

  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_pets
        SET status = 'found',
            resolution_note = ${cleanNote},
            resolution_photo = ${photo},
            resolved_at = ${resolvedAt}
        WHERE id = ${id} AND COALESCE(status, 'active') = 'active'
        RETURNING ${SELECT_COLS}`,
  );
  const rows = execRows<Row>(result);
  if (rows.length > 0) invalidate();
  return rows.length > 0 ? rowToPet(rows[0]!) : null;
}

export async function restorePet(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_pets
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

/** La foto vive en un host externo; el endpoint debe redirigir a esa URL. */
export interface RemotePhoto {
  redirectTo: string;
}

function dataUrlToPhoto(dataUrl: string | null): PhotoData | null {
  if (!dataUrl) return null;
  // Parser central: rechaza subtipos no permitidos (svg/gif).
  const parsed = parseImageDataUri(dataUrl);
  if (!parsed) return null;
  return { contentType: parsed.contentType, buffer: parsed.bytes };
}

/**
 * Sirve la foto de la mascota desde base64 en DB o desde R2 (proxy server-side en
 * vez de 302 a una URL privada). A diferencia de personas NO hay fetch a un
 * origen externo: las fotos de mascotas solo entran por el formulario, nunca por
 * un feed, así que no hay URL de terceros que proxear.
 */
export async function getPetPhoto(
  id: string,
): Promise<PhotoData | RemotePhoto | null> {
  const db = await getDb();
  const rows = await db
    .select({ photo: missingPets.photo })
    .from(missingPets)
    .where(eq(missingPets.id, id));
  const stored = rows[0]?.photo ?? null;
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) {
    if (isR2Url(stored)) {
      const obj = await getObject(keyFromR2Url(stored));
      if (obj) return obj;
    }
    // Si el objeto ya no está, redirigimos igual: el CDN sirve su propio 404 y
    // así no caemos en dataUrlToPhoto, que espera un data-URI y fallaría en
    // silencio devolviendo null.
    return { redirectTo: stored };
  }
  return dataUrlToPhoto(stored);
}

/** Foto-prueba que se subió al marcar la mascota como reunida. */
export async function getPetResolutionPhoto(
  id: string,
): Promise<PhotoData | RemotePhoto | null> {
  const db = await getDb();
  const rows = await db
    .select({ resolutionPhoto: missingPets.resolutionPhoto })
    .from(missingPets)
    .where(eq(missingPets.id, id));
  const dataUrl = rows[0]?.resolutionPhoto ?? null;
  if (dataUrl && /^https?:\/\//i.test(dataUrl)) {
    if (isR2Url(dataUrl)) {
      const obj = await getObject(keyFromR2Url(dataUrl));
      if (obj) return obj;
    }
    return { redirectTo: dataUrl };
  }
  return dataUrlToPhoto(dataUrl);
}

/**
 * Borra la ficha y sus objetos en R2. Sin tabla de supresiones: esa existe para
 * que el motor de fuentes externas no vuelva a importar lo que un admin borró, y
 * aquí no hay fuentes externas — lo borrado no puede volver.
 */
export async function removePet(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({
      photo: missingPets.photo,
      resolutionPhoto: missingPets.resolutionPhoto,
    })
    .from(missingPets)
    .where(eq(missingPets.id, id));
  const row = rows[0];
  if (!row) return false;

  for (const url of [row.photo, row.resolutionPhoto]) {
    if (url) await deleteR2Url(url);
  }

  const result = await db.execute(
    sql`DELETE FROM missing_pets WHERE id = ${id} RETURNING id`,
  );
  const removed = execRows<{ id: string }>(result).length > 0;
  if (removed) invalidate();
  return removed;
}

/** Devuelve una mascota por id como DTO (allowlist), o null. */
export async function getPetById(id: string): Promise<PetDTO | null> {
  const db = await getDb();
  const res = await db.execute(
    sql`SELECT ${SELECT_COLS} FROM missing_pets WHERE id = ${id}`,
  );
  const rows = execRows<Row>(res);
  return rows.length > 0 ? rowToPet(rows[0]!) : null;
}

/** Campos editables de la ficha (no se mueve id/createdAt/status/foto por aquí). */
export interface UpdatePetInput {
  name?: string;
  species?: string;
  breed?: string;
  color?: string;
  sex?: string | null;
  age?: number | string | null;
  description?: string;
  lastSeen?: string;
  contact?: string;
  microchip?: string | null;
}

/**
 * Actualiza campos permitidos. Recorta/clampa con los mismos límites que addPet.
 * Devuelve el DTO actualizado o null si no existe.
 */
export async function updatePet(
  id: string,
  input: UpdatePetInput,
): Promise<PetDTO | null> {
  const sets: ReturnType<typeof sql>[] = [];
  if (input.name !== undefined)
    sets.push(sql`name = ${input.name.trim().slice(0, MAX_NAME)}`);
  if (input.species !== undefined)
    sets.push(sql`species = ${input.species.trim().toLowerCase().slice(0, MAX_SPECIES)}`);
  if (input.breed !== undefined)
    sets.push(sql`breed = ${input.breed.trim().slice(0, MAX_BREED)}`);
  if (input.color !== undefined)
    sets.push(sql`color = ${input.color.trim().slice(0, MAX_COLOR)}`);
  if (input.sex !== undefined) sets.push(sql`sex = ${normalizeSex(input.sex)}`);
  if (input.age !== undefined) sets.push(sql`age = ${normalizeAge(input.age)}`);
  if (input.description !== undefined)
    sets.push(sql`description = ${input.description.trim().slice(0, MAX_DESCRIPTION)}`);
  if (input.lastSeen !== undefined)
    sets.push(sql`last_seen = ${input.lastSeen.trim().slice(0, MAX_LAST_SEEN)}`);
  if (input.contact !== undefined)
    sets.push(sql`contact = ${input.contact.trim().slice(0, MAX_CONTACT)}`);
  if (input.microchip !== undefined)
    sets.push(
      sql`microchip = ${(input.microchip ?? "").trim().slice(0, MAX_MICROCHIP) || null}`,
    );
  if (sets.length === 0) return getPetById(id);

  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE missing_pets SET ${sql.join(sets, sql`, `)}
        WHERE id = ${id}
        RETURNING ${SELECT_COLS}`,
  );
  const rows = execRows<Row>(result);
  if (rows.length > 0) invalidate();
  return rows.length > 0 ? rowToPet(rows[0]!) : null;
}

/** Totales para el panel del directorio. */
export async function countPetStats(): Promise<PetStats> {
  const db = await getDb();
  const res = await db.execute(
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE COALESCE(status, 'active') = 'active')::int AS active,
               count(*) FILTER (WHERE status = 'found')::int AS found,
               count(*) FILTER (
                 WHERE COALESCE(status, 'active') = 'active'
                   AND lat IS NOT NULL AND lng IS NOT NULL
               )::int AS on_map
        FROM missing_pets`,
  );
  const row = execRows<{
    total: number;
    active: number;
    found: number;
    on_map: number;
  }>(res)[0] ?? { total: 0, active: 0, found: 0, on_map: 0 };
  return {
    total: Number(row.total),
    active: Number(row.active),
    found: Number(row.found),
    onMap: Number(row.on_map),
  };
}

export interface ListPetsMapParams {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
  limit?: number;
}

type MapRow = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  last_seen: string;
  has_photo: boolean;
  lat: number;
  lng: number;
  created_at: string | number;
};

/** Marcadores de mascotas activas con coordenadas (viewport opcional). */
export async function listPetsMapMarkers(
  params: ListPetsMapParams = {},
): Promise<PetMapMarker[]> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 500), 1), 2000);

  const conditions: ReturnType<typeof sql>[] = [
    sql`COALESCE(status, 'active') = 'active'`,
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
    sql`SELECT id, name, species, breed, last_seen,
               (photo IS NOT NULL) AS has_photo,
               lat, lng, created_at
        FROM missing_pets
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
  );

  return execRows<MapRow>(res).map((row) => ({
    id: row.id,
    name: row.name,
    species: row.species ?? "",
    breed: row.breed ?? "",
    lastSeen: row.last_seen,
    photoUrl: row.has_photo ? `/api/pets/${row.id}/photo` : null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: Number(row.created_at),
  }));
}
