/**
 * Validación/parseo de data-URIs de imagen — FUENTE ÚNICA (audit M-6).
 *
 * Allowlist cerrada: jpeg, png, webp. Nada de svg (XSS) ni gif. Portado tal cual
 * desde lib/image.ts del app Next previo (mismo trust boundary).
 */
export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const SUBTYPE = "jpeg|png|webp";
// Validación de ESCRITURA: data:image/<sub>;base64,<payload-base64>.
// Usamos .+ (como parseImageDataUri) porque Buffer.from(string, 'base64')
// ignora whitespace/newlines/relleno. El MIME allowlist + Buffer.from vacío
// son las guardas reales, no un charset estricto de base64.
const WRITE_RE = new RegExp(`^data:image/(${SUBTYPE});base64,.+$`);

/** ¿Es un data-URL de imagen permitido y bien formado? (lado escritura). */
export function isAllowedImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && WRITE_RE.test(value);
}

export interface ParsedImage {
  bytes: Buffer;
  contentType: string;
  /** extensión derivada del subtipo (jpeg|png|webp). */
  ext: string;
}

/**
 * Parsea un data-URI a bytes validados. Devuelve null si el MIME no está en la
 * allowlist o el formato es inválido. Lado LECTURA (decodificar para servir):
 * rechaza explícitamente subtipos no permitidos (svg/gif).
 */
export function parseImageDataUri(dataUrl: string): ParsedImage | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1]!.toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(contentType)) return null;
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length === 0) return null;
  const ext = contentType.split("/")[1]!; // jpeg|png|webp
  return { bytes, contentType, ext };
}
