/**
 * Cloudflare R2 upload helper (S3-compatible). Used by the image-migration jobs
 * to move base64-in-DB photos and external-host images onto R2, behind the
 * Cloudflare CDN custom domain.
 *
 * Env (same R2 token used for the static-asset CDN upload):
 *   R2_ENDPOINT, R2_STATIC_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_PUBLIC_BASE   public CDN base, e.g. https://cdn.example.org
 */
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

let _s3: S3Client | null = null;

function s3(): S3Client {
  if (_s3) return _s3;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set");
  }
  _s3 = new S3Client({
    region: "auto", // R2 ignores region but the SDK requires one ("auto" is conventional)
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return _s3;
}

function bucket(): string {
  const b = process.env.R2_STATIC_BUCKET;
  if (!b) throw new Error("R2_STATIC_BUCKET not set");
  return b;
}

/**
 * Namespace prefix for keys (isolates environments within the SAME bucket).
 * Empty in prod -> keys `images/...` (unchanged). In staging set
 * R2_KEY_PREFIX=staging -> keys `staging/images/...`, so staging never overwrites
 * prod photos. Apply at EVERY key-construction site (jobs build keys directly).
 */
export function withPrefix(key: string): string {
  const prefix = (process.env.R2_KEY_PREFIX || "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${key}` : key;
}

/** Public CDN URL for a stored object key. */
export function publicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  if (!base) throw new Error("R2_PUBLIC_BASE not set");
  return `${base}/${key}`;
}

/** True if the object already exists (so re-runs can skip re-uploading). */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * PUT bytes to R2 under `key`. Immutable cache header (objects are addressed by
 * a content/id-derived key, never overwritten in place). Returns the public URL.
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

/** Parse a `data:<mime>;base64,<payload>` URI into bytes + mime + extension. */
export function parseDataUri(
  uri: string,
): { bytes: Buffer; contentType: string; ext: string } | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  const contentType = m[1] || "application/octet-stream";
  const isB64 = Boolean(m[2]);
  const bytes = isB64
    ? Buffer.from(m[3], "base64")
    : Buffer.from(decodeURIComponent(m[3]), "utf8");
  const ext = contentType.split("/")[1]?.split("+")[0] || "bin";
  return { bytes, contentType, ext };
}
