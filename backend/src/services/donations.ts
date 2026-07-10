/**
 * Service de donaciones. Lógica + consultas Drizzle (port directo de
 * lib/donations.ts + lib/donation-shared.ts del app Next previo), preservando
 * EXACTAMENTE las consultas y el contrato de salida.
 *
 * El backend SIEMPRE tiene DATABASE_URL (env lo exige), así que NO se replica el
 * fallback en-memoria del lib previo (era para dev sin DB en Next). Las consultas
 * son idénticas a la rama hasDbEnv() del original.
 *
 * Allowlist de salida: listRecentDonations selecciona solo {id,name,amountUsd,
 * createdAt} — NUNCA expone ip_hash / user_agent.
 */
import { sql, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { donations } = schema;

// --- Constantes de contrato (espejan lib/donation-shared.ts) ---
// URL de donación del DEPLOYER (nunca de la plantilla). null = donaciones
// externas deshabilitadas; el frontend oculta el botón.
export const PAYPAL_DONATION_URL: string | null =
  process.env.PAYPAL_DONATION_URL ?? null;
export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 1_000_000;
export const MONTHLY_DONATION_GOAL_CENTS = 80_000;

const DAY_MS = 24 * 60 * 60 * 1000;

// DTO público de donación (allowlist explícita).
export interface DonationDTO {
  id: string;
  name: string;
  amountCents: number;
  createdAt: number;
}

export interface DonationStats {
  count: number;
  totalCents: number;
  last24hCount: number;
  last24hCents: number;
}

export interface DonationMonthlyStats {
  raisedCents: number;
  goalCents: number;
}

// Columnas comunes a las listas (sin exponer ip_hash/user_agent).
const listColumns = {
  id: donations.id,
  name: donations.name,
  amountUsd: donations.amountUsd,
  createdAt: donations.createdAt,
} as const;

type DonationRow = {
  id: string;
  name: string;
  amountUsd: number;
  createdAt: number;
};

function rowToDonationDTO(row: DonationRow): DonationDTO {
  return {
    id: row.id,
    name: row.name,
    amountCents: Number(row.amountUsd),
    createdAt: Number(row.createdAt),
  };
}

export async function listRecentDonations(limit = 30): Promise<DonationDTO[]> {
  const db = await getDb();
  const rows = await db
    .select(listColumns)
    .from(donations)
    .orderBy(desc(donations.createdAt))
    .limit(limit);
  return rows.map((r) => rowToDonationDTO(r as DonationRow));
}

/** Devuelve una donación por id como DTO (allowlist), o null si no existe. */
export async function getDonationById(id: string): Promise<DonationDTO | null> {
  const db = await getDb();
  const rows = await db
    .select(listColumns)
    .from(donations)
    .where(eq(donations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return rowToDonationDTO(row as DonationRow);
}

/** Todas las donaciones, más recientes primero (panel admin). DTO allowlist. */
export async function listAllDonations(): Promise<DonationDTO[]> {
  const db = await getDb();
  const rows = await db
    .select(listColumns)
    .from(donations)
    .orderBy(desc(donations.createdAt));
  return rows.map((r) => rowToDonationDTO(r as DonationRow));
}

function startOfCurrentMonthMs(now = Date.now()): number {
  const date = new Date(now);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export async function getMonthlyDonationStats(): Promise<DonationMonthlyStats> {
  const goalCents = MONTHLY_DONATION_GOAL_CENTS;
  const monthStart = startOfCurrentMonthMs();
  const db = await getDb();
  const rows = await db
    .select({
      raisedCents: sql<number>`COALESCE(SUM(${donations.amountUsd}), 0)::int`,
    })
    .from(donations)
    .where(
      sql`${donations.createdAt} >= ${monthStart} AND ${donations.status} = 'completed'`,
    );
  return {
    raisedCents: Number(rows[0]?.raisedCents ?? 0),
    goalCents,
  };
}

export async function getDonationStats(): Promise<DonationStats> {
  const cutoff = Date.now() - DAY_MS;
  const db = await getDb();
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      totalCents: sql<number>`COALESCE(SUM(${donations.amountUsd}), 0)::int`,
      last24hCount: sql<number>`COUNT(*) FILTER (WHERE ${donations.createdAt} >= ${cutoff})::int`,
      last24hCents: sql<number>`COALESCE(SUM(${donations.amountUsd}) FILTER (WHERE ${donations.createdAt} >= ${cutoff}), 0)::int`,
    })
    .from(donations);
  const row = rows[0];
  return {
    count: Number(row?.count ?? 0),
    totalCents: Number(row?.totalCents ?? 0),
    last24hCount: Number(row?.last24hCount ?? 0),
    last24hCents: Number(row?.last24hCents ?? 0),
  };
}

/** Registra una intención de donación. Devuelve solo el id (el route arma la URL). */
export async function recordDonation(input: {
  name: string;
  amountCents: number;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(donations).values({
    id,
    name: input.name.trim(),
    amountUsd: input.amountCents,
    ipHash: input.ipHash ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: Date.now(),
    status: "intent",
  });
  return { id };
}
