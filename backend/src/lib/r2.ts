/**
 * Cloudflare R2 upload helper para el request path (lado app).
 *
 * Las fotos nuevas subidas por los formularios públicos van directo a R2 aquí,
 * en vez de acumularse como base64 en Postgres. Mismo env + bucket + key scheme
 * que worker/r2.ts: `images/<table>/<id>.<ext>`, servido desde el CDN.
 *
 * Env (token R2 compartido):
 *   R2_ENDPOINT, R2_STATIC_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_PUBLIC_BASE   base pública del CDN, p.ej. https://cdn.example.org
 *
 * Política: si R2 está configurado, intentamos subir al CDN; si falla, el caller
 * guarda base64 en DB (nunca pierde la foto del usuario). Si R2 no está
 * configurado (dev local), `isR2Configured()` es false y los callers usan base64.
 *
 * Portado tal cual desde lib/r2.ts del app Next previo (lee process.env directo).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

let _s3: S3Client | null = null;

/** Quita comillas envolventes que Docker env_file puede dejar literales en el valor. */
function r2Env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null || raw === "") return undefined;
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** True solo cuando TODAS las vars de R2 están — gatea el camino de escritura R2. */
export function isR2Configured(): boolean {
  return Boolean(
    r2Env("R2_ENDPOINT") &&
      r2Env("R2_STATIC_BUCKET") &&
      r2Env("R2_ACCESS_KEY_ID") &&
      r2Env("R2_SECRET_ACCESS_KEY") &&
      r2Env("R2_PUBLIC_BASE"),
  );
}

function s3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: "auto", // R2 ignora la región pero el SDK exige una ("auto" es convencional)
    endpoint: r2Env("R2_ENDPOINT"),
    credentials: {
      accessKeyId: r2Env("R2_ACCESS_KEY_ID") as string,
      secretAccessKey: r2Env("R2_SECRET_ACCESS_KEY") as string,
    },
    forcePathStyle: true,
  });
  return _s3;
}

/**
 * Prefijo de namespace para las keys (aísla entornos en el MISMO bucket). En
 * prod va vacío -> keys `images/...` (sin cambio). En staging pon
 * R2_KEY_PREFIX=staging -> keys `staging/images/...`, para no pisar fotos de
 * prod. Debe aplicarse en TODOS los sitios que construyen una key (ver también
 * worker/r2.ts, worker/jobs/migratePhoto.ts y hubImage.ts).
 */
export function withPrefix(key: string): string {
  const prefix = (r2Env("R2_KEY_PREFIX") || "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${key}` : key;
}

/** URL pública del CDN para una key almacenada. */
function publicUrl(key: string): string {
  const base = (r2Env("R2_PUBLIC_BASE") || "").replace(/\/$/, "");
  return `${base}/${key}`;
}

/** True cuando `url` fue generada por `publicUrl()`, i.e. apunta a nuestro R2. */
export function isR2Url(url: string): boolean {
  const base = (r2Env("R2_PUBLIC_BASE") || "").replace(/\/$/, "");
  if (!base) return false;
  return url.startsWith(base);
}

/** Extrae la key de S3 desde una URL generada por `publicUrl()`. */
export function keyFromR2Url(url: string): string {
  const base = (r2Env("R2_PUBLIC_BASE") || "").replace(/\/$/, "");
  return url.slice(base.length + 1); // strip "base" + "/"
}

/** Borra una URL perteneciente al R2 del proyecto. Las URLs externas se ignoran. */
export async function deleteR2Url(url: string): Promise<boolean> {
  if (!isR2Url(url)) return false;
  await s3().send(
    new DeleteObjectCommand({
      Bucket: r2Env("R2_STATIC_BUCKET"),
      Key: keyFromR2Url(url),
    }),
  );
  return true;
}

/**
 * Descarga un objeto de R2 y devuelve sus bytes + contentType.
 * Null si no existe, falla o es inaccesible — el caller decide el fallback.
 */
export async function getObject(
  key: string,
): Promise<{ contentType: string; buffer: Buffer } | null> {
  try {
    const resp = await s3().send(
      new GetObjectCommand({
        Bucket: r2Env("R2_STATIC_BUCKET"),
        Key: key,
      }),
    );
    if (!resp.Body) return null;
    // Body en Node.js es Readable (AsyncIterable<Uint8Array>)
    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return {
      contentType: resp.ContentType ?? "application/octet-stream",
      buffer: Buffer.concat(chunks),
    };
  } catch {
    return null;
  }
}

/** Parsea un `data:image/<mime>;base64,<payload>` a bytes validados. */
function parseDataUri(
  uri: string,
): { bytes: Buffer; contentType: string; ext: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  const contentType = m[1]!;
  if (!ALLOWED_MIME.has(contentType)) return null;
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length === 0) return null;
  const ext = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1]!;
  return { bytes, contentType, ext };
}

/**
 * Sube una imagen base64 (data URL) a R2 bajo `images/<table>/<id>.<ext>` y
 * devuelve su URL pública del CDN. Lanza si R2 está mal configurado, el data URL
 * es inválido, o el PUT falla — los callers no deben tragarse esto (hard-fail).
 *
 * El caller debe checar `isR2Configured()` primero; si es false, usa base64.
 */
export async function uploadPhotoDataUrl(
  dataUrl: string,
  table: string,
  id: string,
): Promise<string> {
  const parsed = parseDataUri(dataUrl);
  if (!parsed) throw new Error("Foto inválida: se esperaba JPG, PNG o WebP en base64.");
  const key = withPrefix(`images/${table}/${id}.${parsed.ext}`);
  await s3().send(
    new PutObjectCommand({
      Bucket: r2Env("R2_STATIC_BUCKET"),
      Key: key,
      Body: parsed.bytes,
      ContentType: parsed.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

/** Sube a R2 si está configurado; si falla, conserva el data-URL en DB (no pierde el reporte). */
export async function persistPhotoDataUrl(
  dataUrl: string,
  table: string,
  id: string,
): Promise<{ stored: string; migratedAt: number | null }> {
  if (!isR2Configured()) {
    return { stored: dataUrl, migratedAt: null };
  }
  try {
    const stored = await uploadPhotoDataUrl(dataUrl, table, id);
    return { stored, migratedAt: Date.now() };
  } catch (err) {
    console.warn("[r2] upload falló, guardando base64 en DB", {
      table,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { stored: dataUrl, migratedAt: null };
  }
}
