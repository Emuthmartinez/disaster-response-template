/**
 * Copia la foto externa de un registro del hub a R2 y reescribe la fila.
 * Ver docs/modules.md (sección ENABLE_HUB_FEDERATION).
 *
 * Por qué: el `photo_url` del hub apunta al storage del socio (Supabase), que es
 * efímero y SE ROMPE (medido: el bucket de damaged_building da 404). Hotlinkear
 * pondría imágenes rotas/3rd-party en nuestro mapa. Copiamos a R2 y servimos
 * desde nuestro CDN. Fuente muerta (404/permanente) -> marca photo_broken.
 *
 * Idempotente: si ya está en R2 (objectExists) se salta la descarga.
 * Clave R2: images/hub/<type>/<hub_id>.<ext>
 */
import { targetPool } from "../db";
import { objectExists, putObject, publicUrl, withPrefix } from "../r2";
import { HUB_HAS_PHOTO, HUB_TABLE, type HubType } from "../hub/config";

const MAX_BYTES = Number(process.env.HUB_IMAGE_MAX_BYTES || 8_000_000); // 8MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface HubImageResult {
  status: "migrated" | "skipped" | "broken" | "missing";
  url?: string;
}

async function markBroken(table: string, hubId: string): Promise<void> {
  await targetPool().query(
    `UPDATE "${table}" SET photo_broken = true, updated_at = $2 WHERE hub_id = $1`,
    [hubId, Date.now()],
  );
}

export async function hubImage(type: HubType, hubId: string): Promise<HubImageResult> {
  if (!HUB_HAS_PHOTO[type]) return { status: "skipped" };
  const table = HUB_TABLE[type];
  const pool = targetPool();

  const { rows } = await pool.query(
    `SELECT photo_external_url, photo_migrated_at FROM "${table}" WHERE hub_id = $1`,
    [hubId],
  );
  if (rows.length === 0) return { status: "missing" };
  const ext = rows[0].photo_external_url as string | null;
  if (!ext) return { status: "skipped" };
  if (rows[0].photo_migrated_at) return { status: "skipped" }; // ya copiada

  // Descarga la imagen del socio.
  let resp: Response;
  try {
    resp = await fetch(ext, { signal: AbortSignal.timeout(20_000) });
  } catch {
    // Fallo de red transitorio -> dejar que reintente (no marcar broken aún).
    throw new Error(`fetch failed for ${hubId}`);
  }
  if (resp.status === 404 || resp.status === 410 || resp.status === 400) {
    // Fuente muerta permanente (caso damaged_building) -> placeholder.
    await markBroken(table, hubId);
    return { status: "broken" };
  }
  if (!resp.ok) throw new Error(`image ${hubId} -> ${resp.status}`); // reintentable

  const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim();
  if (!ALLOWED.has(contentType)) {
    await markBroken(table, hubId);
    return { status: "broken" };
  }

  const key = withPrefix(`images/hub/${type}/${hubId}.${EXT[contentType]}`);
  let url: string;
  if (await objectExists(key)) {
    url = publicUrl(key);
  } else {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      await markBroken(table, hubId);
      return { status: "broken" };
    }
    url = await putObject(key, buf, contentType);
  }

  await pool.query(
    `UPDATE "${table}"
       SET photo_url = $2, photo_migrated_at = $3, photo_broken = false, updated_at = $3
     WHERE hub_id = $1`,
    [hubId, url, Date.now()],
  );
  return { status: "migrated", url };
}
