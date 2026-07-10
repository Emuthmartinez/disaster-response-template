/**
 * Service de reportes de emergencia. La LÓGICA y las consultas Drizzle viven
 * aquí (no en el route). Portado desde lib/store.ts del app Next previo,
 * preservando el comportamiento EXACTO y el MISMO contrato de salida
 * (EmergencyReport) que el frontend ya consume.
 *
 * Diferencia con el app previo: el backend SIEMPRE tiene DATABASE_URL (validado
 * en config/env), así que el fallback en-memoria / `hasDbEnv()` desaparece —
 * la persistencia es obligatoria, como ya lo forzaba addReport bajo VERCEL.
 *
 * Fotos: la columna `photo` está SOBRECARGADA (URL de R2 si está configurado, o
 * data-URL base64 si no). NUNCA se expone cruda; el DTO solo deriva `photoUrl`
 * (la ruta /api/reports/:id/photo), igual que antes.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cached, invalidate } from "@/lib/cache";
import { persistPhotoDataUrl, getObject, isR2Url, keyFromR2Url } from "@/lib/r2";
import { isAllowedImageDataUrl, parseImageDataUri } from "@/lib/image";

const { reports } = schema;

export type ReportType =
  | "critical"
  | "supplies"
  | "shelter"
  | "nopower"
  | "missing"
  | "building"
  | "starlink";

/** Tipos válidos de marcador (orden = el del app previo en lib/types.ts). */
export const REPORT_TYPE_KEYS: ReportType[] = [
  "critical",
  "supplies",
  "shelter",
  "nopower",
  "missing",
  "building",
  "starlink",
];

/** Límite del data URL de la foto (~1.4 MB en base64 ≈ 1 MB de imagen). */
export const MAX_REPORT_PHOTO_CHARS = 1_400_000;

/** DTO público (allowlist explícita; idéntico a EmergencyReport del frontend). */
export interface ReportDTO {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  place: string;
  affected: number;
  needs: string;
  /** URL del endpoint que sirve la foto si el reporte tiene una, o null. */
  photoUrl: string | null;
  /** Cantidad de confirmaciones por terceros. */
  confirmations: number;
  createdAt: number;
}

export interface CreateReportInput {
  type: ReportType;
  lat: number;
  lng: number;
  place: string;
  affected?: number;
  needs?: string;
  photo?: string | null;
}

export const DEFAULT_REPORT_PAGE_SIZE = 500;
export const MAX_REPORT_PAGE_SIZE = 500;

export interface ReportPage {
  reports: ReportDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PhotoData {
  contentType: string;
  buffer: Buffer;
}
/** Foto alojada en R2/CDN: el endpoint redirige en vez de servir bytes. */
export interface RemotePhoto {
  redirectTo: string;
}

/** ¿Es un data-URL de imagen permitido y bien formado? (allowlist M-6). */
export const isValidPhotoDataUrl = isAllowedImageDataUrl;

/** El backend siempre persiste (DATABASE_URL es obligatorio). */
export function isPersistent(): boolean {
  return true;
}

/**
 * Normaliza el input a la fila a insertar + DTO. Misma lógica que createReport()
 * de lib/store.ts: recorta place/needs, clamp de affected, valida foto.
 */
function createReport(input: CreateReportInput): {
  report: ReportDTO;
  photo: string | null;
} {
  const type = REPORT_TYPE_KEYS.includes(input.type) ? input.type : "critical";
  const id = crypto.randomUUID();
  const photo =
    typeof input.photo === "string" &&
    input.photo &&
    isValidPhotoDataUrl(input.photo) &&
    input.photo.length <= MAX_REPORT_PHOTO_CHARS
      ? input.photo
      : null;
  return {
    photo,
    report: {
      id,
      type,
      lat: Number(input.lat),
      lng: Number(input.lng),
      place: input.place.trim().slice(0, 200),
      affected: Math.max(0, Math.trunc(Number(input.affected) || 0)),
      needs: (input.needs ?? "").trim().slice(0, 1000),
      photoUrl: photo ? `/api/reports/${id}/photo` : null,
      confirmations: 0,
      createdAt: Date.now(),
    },
  };
}

/**
 * Lista los reportes (máximo 500, más recientes primero). Selecciona un booleano
 * `hasPhoto` en vez de exponer la columna `photo` completa, igual que antes.
 */
function reportSelection() {
  return {
    id: reports.id,
    type: reports.type,
    lat: reports.lat,
    lng: reports.lng,
    place: reports.place,
    affected: reports.affected,
    needs: reports.needs,
    hasPhoto: sql<boolean>`${reports.photo} IS NOT NULL`,
    confirmations: reports.confirmations,
    createdAt: reports.createdAt,
  };
}

type ReportRow = Awaited<ReturnType<typeof selectReportRows>>[number];

function reportRowToDto(row: ReportRow): ReportDTO {
  return {
    id: row.id,
    type: row.type as ReportType,
    lat: Number(row.lat),
    lng: Number(row.lng),
    place: row.place,
    affected: Number(row.affected),
    needs: row.needs,
    photoUrl: row.hasPhoto ? `/api/reports/${row.id}/photo` : null,
    confirmations: Number(row.confirmations ?? 0),
    createdAt: Number(row.createdAt),
  };
}

async function selectReportRows(limit?: number, offset = 0) {
  const db = await getDb();
  const query = db
    .select(reportSelection())
    .from(reports)
    .orderBy(desc(reports.createdAt));
  return limit === undefined ? query : query.limit(limit).offset(offset);
}

export async function listReports(): Promise<ReportDTO[]> {
  const rows = await cached("reports:all", 4_000, () => selectReportRows());
  return rows
    .filter((row) => REPORT_TYPE_KEYS.includes(row.type as ReportType))
    .map(reportRowToDto);
}

export async function listReportsPage(
  page = 1,
  pageSize = DEFAULT_REPORT_PAGE_SIZE,
): Promise<ReportPage> {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(MAX_REPORT_PAGE_SIZE, Math.max(1, Math.trunc(pageSize)));
  return cached(`reports:page:${safePage}:${safePageSize}`, 4_000, async () => {
    const db = await getDb();
    const [rows, countRows] = await Promise.all([
      selectReportRows(safePageSize, (safePage - 1) * safePageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(reports),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      reports: rows
        .filter((row) => REPORT_TYPE_KEYS.includes(row.type as ReportType))
        .map(reportRowToDto),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  });
}

/**
 * Crea y persiste un reporte. Si R2 está configurado, la foto va al CDN; si la
 * subida falla, se guarda base64. Devuelve el DTO con photoUrl derivada.
 */
export async function addReport(input: CreateReportInput): Promise<ReportDTO> {
  const { report, photo } = createReport(input);
  let stored = photo;
  let migratedAt: number | null = null;
  if (photo) {
    ({ stored, migratedAt } = await persistPhotoDataUrl(
      photo,
      "reports",
      report.id,
    ));
  }
  const db = await getDb();
  await db.insert(reports).values({
    id: report.id,
    type: report.type,
    lat: report.lat,
    lng: report.lng,
    place: report.place,
    affected: report.affected,
    needs: report.needs,
    photo: stored,
    photoMigratedAt: migratedAt,
    createdAt: report.createdAt,
  });
  invalidate();
  return report;
}

/**
 * Devuelve la foto de un reporte: bytes decodificados (data-URL en DB) o una
 * redirección al CDN (foto migrada a R2). null si no hay foto. Misma lógica que
 * getReportPhoto() de lib/store.ts.
 */
export async function getReportPhoto(
  id: string,
): Promise<PhotoData | RemotePhoto | null> {
  const db = await getDb();
  const rows = await db
    .select({ photo: reports.photo })
    .from(reports)
    .where(eq(reports.id, id));
  const dataUrl = rows[0]?.photo ?? null;
  if (!dataUrl) return null;
  if (/^https?:\/\//i.test(dataUrl)) {
    // URL de R2 → proxy (fetch server-side en vez de 302 a URL privada)
    if (isR2Url(dataUrl)) {
      const obj = await getObject(keyFromR2Url(dataUrl));
      if (obj) return obj;
    }
    return { redirectTo: dataUrl };
  }
  // Parser central: rechaza subtipos no permitidos (svg/gif) (audit M-6).
  const parsed = parseImageDataUri(dataUrl);
  if (!parsed) return null;
  return { contentType: parsed.contentType, buffer: parsed.bytes };
}

/**
 * Confirma un reporte deduplicando por hash de IP. Devuelve el nuevo total de
 * confirmaciones, o `null` si esa IP ya había confirmado (dedup). Una sola
 * sentencia atómica (CTE INSERT ... ON CONFLICT DO NOTHING + UPDATE), portada
 * exactamente desde lib/store.ts.
 */
export async function confirmReport(
  id: string,
  ipKey: string,
): Promise<
  | { status: "confirmed"; confirmations: number }
  | { status: "duplicate" }
  | { status: "not-found" }
> {
  const db = await getDb();
  const res = (await db.execute(sql`
    WITH target AS (
      SELECT id FROM reports WHERE id = ${id}
    ), ins AS (
      INSERT INTO report_confirmations (report_id, ip_hash, created_at)
      SELECT id, ${ipKey}, ${Date.now()} FROM target
      ON CONFLICT DO NOTHING
      RETURNING report_id
    ), updated AS (
    UPDATE reports r SET confirmations = confirmations + 1
    FROM ins WHERE r.id = ins.report_id
    RETURNING r.confirmations
    )
    SELECT EXISTS(SELECT 1 FROM target) AS exists,
           (SELECT confirmations FROM updated) AS confirmations
  `)) as unknown;
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as
    | { exists: boolean; confirmations: number | null }[]
    | undefined;
  const row = rows?.[0];
  if (!row?.exists) return { status: "not-found" };
  if (row.confirmations === null) return { status: "duplicate" };
  invalidate();
  return { status: "confirmed", confirmations: Number(row.confirmations) };
}

/** Devuelve un reporte por id como DTO (allowlist), o null si no existe. */
export async function getReportById(id: string): Promise<ReportDTO | null> {
  const db = await getDb();
  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      lat: reports.lat,
      lng: reports.lng,
      place: reports.place,
      affected: reports.affected,
      needs: reports.needs,
      hasPhoto: sql<boolean>`${reports.photo} IS NOT NULL`,
      confirmations: reports.confirmations,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as ReportType,
    lat: Number(row.lat),
    lng: Number(row.lng),
    place: row.place,
    affected: Number(row.affected),
    needs: row.needs,
    photoUrl: row.hasPhoto ? `/api/reports/${row.id}/photo` : null,
    confirmations: Number(row.confirmations ?? 0),
    createdAt: Number(row.createdAt),
  };
}

/** Campos editables de un reporte (no se permite mover id/createdAt/confirmations). */
export interface UpdateReportInput {
  type?: ReportType;
  lat?: number;
  lng?: number;
  place?: string;
  affected?: number;
  needs?: string;
}

/** Actualiza campos permitidos de un reporte. Devuelve el DTO actualizado o null. */
export async function updateReport(
  id: string,
  input: UpdateReportInput,
): Promise<ReportDTO | null> {
  const db = await getDb();
  const patch: Record<string, unknown> = {};
  if (input.type !== undefined && REPORT_TYPE_KEYS.includes(input.type)) patch.type = input.type;
  if (input.lat !== undefined) patch.lat = Number(input.lat);
  if (input.lng !== undefined) patch.lng = Number(input.lng);
  if (input.place !== undefined) patch.place = input.place.trim().slice(0, 200);
  if (input.affected !== undefined) patch.affected = Math.max(0, Math.trunc(Number(input.affected) || 0));
  if (input.needs !== undefined) patch.needs = input.needs.trim().slice(0, 1000);
  if (Object.keys(patch).length === 0) return getReportById(id);
  await db.update(reports).set(patch).where(eq(reports.id, id));
  invalidate();
  return getReportById(id);
}

/** Elimina un reporte (marcar como atendido). True si existía. */
export async function removeReport(id: string): Promise<boolean> {
  const db = await getDb();
  // `.returning()` tiene overloads incompatibles entre los dos drivers; usamos
  // el escape `sql`, igual que en lib/store.ts.
  const res = (await db.execute(
    sql`DELETE FROM ${reports} WHERE ${reports.id} = ${id} RETURNING id`,
  )) as unknown;
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as unknown[];
  if (rows.length > 0) invalidate();
  return rows.length > 0;
}
