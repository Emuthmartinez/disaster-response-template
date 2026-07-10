/**
 * Service del espejo READ-ONLY del hub federado (otros sitios socios). Port de
 * app/api/hub/reports + app/api/hub/stats del app Next. La LÓGICA y las consultas
 * viven aquí; el route solo aplica middleware y responde.
 *
 * Privacidad: el hub NO trae PII. Igual exponemos por allowlist (nunca la fila
 * cruda) y reescribimos la imagen a la URL de R2 (o null) — nunca hotlink al
 * storage del socio.
 */
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { cached } from "@/lib/cache";

// type del hub -> tabla Drizzle. Catálogo cerrado de 5 (docs/rfcs/0002).
const TABLE_BY_TYPE = {
  missing_person: schema.hubMissingPersons,
  checkin: schema.hubCheckins,
  help_request: schema.hubHelpRequests,
  help_offer: schema.hubHelpOffers,
  damaged_building: schema.hubDamagedBuildings,
} as const;
export type HubType = keyof typeof TABLE_BY_TYPE;
export const HUB_TYPES = Object.keys(TABLE_BY_TYPE) as HubType[];

export const MAX_LIMIT = 200;

/** Resuelve la URL de imagen a servir: R2 si ya está, si no nada (no hotlink). */
function photo(row: Record<string, unknown>): string | null {
  if (row.photoBroken) return null;
  return (row.photoUrl as string) || null;
}

/** Lista los reportes federados de un tipo (allowlist, cacheado 15s). */
export async function listHubReports(
  type: HubType,
  limit: number,
): Promise<Record<string, unknown>[]> {
  return cached(`hub:${type}:${limit}`, 15_000, async () => {
    const db = await getDb();
    const table = TABLE_BY_TYPE[type];
    const rows = await db
      .select()
      .from(table)
      .orderBy(desc(table.ingestedAt))
      .limit(limit);
    // Reescribe la imagen a la URL de R2 (o null) y quita columnas internas.
    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      const out: Record<string, unknown> = {
        hub_id: row.hubId,
        source: row.source,
        city: row.city,
        lat: row.lat,
        lng: row.lng,
        created_at: row.hubCreatedAt,
      };
      // campos por tipo (lo que exista en la fila)
      for (const k of [
        "name",
        "status",
        "message",
        "place_name",
        "category",
        "description",
        "urgency",
        "availability",
        "available",
        "severity",
      ]) {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        if (row[camel] !== undefined && row[camel] !== null) out[k] = row[camel];
      }
      if ("photoUrl" in row || "photoExternalUrl" in row) {
        out.photo_url = photo(row);
        out.photo_broken = Boolean(row.photoBroken);
      }
      return out;
    });
  });
}

// type del hub -> tabla física (para los counts por nombre). Catálogo cerrado.
const STAT_TABLES: { type: string; table: string; hasPhoto: boolean }[] = [
  { type: "missing_person", table: "hub_missing_persons", hasPhoto: true },
  { type: "checkin", table: "hub_checkins", hasPhoto: true },
  { type: "help_request", table: "hub_help_requests", hasPhoto: false },
  { type: "help_offer", table: "hub_help_offers", hasPhoto: false },
  { type: "damaged_building", table: "hub_damaged_buildings", hasPhoto: true },
];

export interface HubTypeStat {
  type: string;
  count: number;
  photos?: number;
  broken?: number;
  lastIngestedAt: number | null;
}

export interface HubStats {
  total: number;
  byType: HubTypeStat[];
}

/** Conteos del espejo federado por tipo + total (cacheado 30s). */
export async function getHubStats(): Promise<HubStats> {
  return cached("hub:stats", 30_000, async () => {
    const db = await getDb();
    // Los 5 counts son independientes → en paralelo (audit M-3).
    const byType: HubTypeStat[] = await Promise.all(
      STAT_TABLES.map(async ({ type, table, hasPhoto }) => {
        // sql.raw para el nombre de tabla (validado: viene de la lista cerrada).
        const photoCols = hasPhoto
          ? sql`, count(*) FILTER (WHERE photo_url IS NOT NULL)::int AS photos,
                 count(*) FILTER (WHERE photo_broken)::int AS broken`
          : sql``;
        const res = await db.execute(
          sql`SELECT count(*)::int AS count,
                     max(ingested_at) AS last_ingested${photoCols}
              FROM ${sql.raw(`"${table}"`)}`,
        );
        const rows =
          (res as unknown as { rows?: Record<string, unknown>[] }).rows ??
          (res as unknown as Record<string, unknown>[]);
        const r = (Array.isArray(rows) ? rows[0] : undefined) ?? {};
        return {
          type,
          count: Number(r.count ?? 0),
          ...(hasPhoto
            ? { photos: Number(r.photos ?? 0), broken: Number(r.broken ?? 0) }
            : {}),
          lastIngestedAt: r.last_ingested != null ? Number(r.last_ingested) : null,
        };
      }),
    );
    const total = byType.reduce((a, b) => a + b.count, 0);
    return { total, byType };
  });
}
