/**
 * Image migration jobs. One job = one row id. Moves the row's photo onto R2 and
 * rewrites the column to the public CDN URL, then stamps photo_migrated_at so
 * re-runs skip it (resumability).
 *
 * Two cases, same job:
 *  - base64: `photo` is a `data:image/...;base64,...` URI -> decode -> R2.
 *  - external: `photo_external_url` (or an http(s) `photo`) -> fetch -> R2.
 *
 * Multi-node safe SIN retener conexión a través de I/O (audit M-4): la dedup la
 * dan (a) el jobId determinístico `img-<table>-<id>` (un solo job por fila) y
 * (b) objectExists(key) en R2 (idempotente). Por eso NO hace falta mantener un
 * FOR UPDATE abierto durante el fetch+PUT: leemos en una txn corta, hacemos el
 * I/O de red SIN client pooleado, y escribimos con un UPDATE guardado
 * (WHERE photo_migrated_at IS NULL) que es atómico y resuelve cualquier carrera.
 */
import { targetPool } from "../db";
import { putObject, publicUrl, objectExists, parseDataUri, withPrefix } from "../r2";

export type PhotoTable = "missing_persons" | "reports";

interface PhotoRow {
  id: string;
  photo: string | null;
  photo_external_url: string | null;
  already: boolean;
}

const MAX_BYTES = 15 * 1024 * 1024; // skip absurdly large fetches

/** Lee la fila (sin lock; la dedup es por jobId + objectExists). */
async function readRow(table: PhotoTable, id: string): Promise<PhotoRow | null> {
  const extCol = table === "missing_persons" ? ", photo_external_url" : "";
  const { rows } = await targetPool().query(
    `SELECT id, photo${extCol}, photo_migrated_at FROM "${table}" WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    photo: (r.photo as string) ?? null,
    photo_external_url: (r.photo_external_url as string) ?? null,
    already: r.photo_migrated_at != null,
  };
}

/**
 * Marca la fila como migrada solo si seguía pendiente (guard atómico). Devuelve
 * true si esta llamada fue la que la marcó; false si otra ya lo hizo (carrera).
 */
async function stampMigrated(
  table: PhotoTable,
  id: string,
  photoUrl: string | null,
): Promise<boolean> {
  const now = Date.now();
  const sql =
    photoUrl === null
      ? `UPDATE "${table}" SET photo_migrated_at = $1
           WHERE id = $2 AND photo_migrated_at IS NULL`
      : `UPDATE "${table}" SET photo = $3, photo_migrated_at = $1
           WHERE id = $2 AND photo_migrated_at IS NULL`;
  const args = photoUrl === null ? [now, id] : [now, id, photoUrl];
  const res = await targetPool().query(sql, args);
  return (res.rowCount ?? 0) > 0;
}

async function fetchExternal(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return null;
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { bytes: buf, contentType };
}

export interface MigratePhotoResult {
  id: string;
  status: "migrated" | "skipped" | "no-photo" | "fetch-failed" | "already";
  url?: string;
}

export async function migratePhoto(
  table: PhotoTable,
  id: string,
): Promise<MigratePhotoResult> {
  // 1) Leer la fila (txn implícita corta, sin retener client).
  const row = await readRow(table, id);
  if (!row) return { id, status: "skipped" }; // borrada entre encolar y procesar
  if (row.already) return { id, status: "already" };

  // 2) Resolver los bytes: base64 directo, o fetch externo. El I/O de red ocurre
  //    AQUÍ, sin ninguna conexión DB pooleada retenida (audit M-4).
  let bytes: Buffer | null = null;
  let contentType = "application/octet-stream";
  let ext = "bin";

  if (row.photo && row.photo.startsWith("data:")) {
    const parsed = parseDataUri(row.photo);
    if (parsed) ({ bytes, contentType, ext } = parsed);
  } else {
    const src =
      row.photo_external_url ||
      (row.photo && /^https?:\/\//.test(row.photo) ? row.photo : null);
    if (src) {
      const fetched = await fetchExternal(src);
      if (!fetched) {
        // URL muerta: dejamos photo_migrated_at en NULL y devolvemos fetch-failed
        // para que el job REINTENTE (backoff). Los 404 permanentes agotan intentos
        // y la fila queda pendiente, visible en un reporte de "sigue NULL".
        return { id, status: "fetch-failed" };
      }
      bytes = fetched.bytes;
      contentType = fetched.contentType;
      ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
    }
  }

  if (!bytes) {
    // No hay foto que migrar. Sello para que no se vuelva a encolar.
    await stampMigrated(table, id, null);
    return { id, status: "no-photo" };
  }

  // 3) Subir a R2 (idempotente por key) — también fuera de cualquier txn.
  const key = withPrefix(`images/${table}/${id}.${ext}`);
  const url = (await objectExists(key))
    ? publicUrl(key)
    : await putObject(key, bytes, contentType);

  // 4) Escribir la URL con guard atómico (txn corta). Si otro worker ya selló la
  //    fila (carrera improbable por el jobId único), el rowCount es 0 → ya está.
  const stamped = await stampMigrated(table, id, url);
  return { id, status: stamped ? "migrated" : "already", url };
}
