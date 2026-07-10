/**
 * Service de credenciales de la RÉPLICA PÚBLICA (hub SQL, RFC 0006).
 *
 * Emitir una credencial = tres efectos, orquestados aquí:
 *   1. CREATE ROLE consumer_<id> en el HUB (conexión aparte HUB_ADMIN_DATABASE_URL,
 *      rol CREATEROLE — NO la DB de la app) + GRANT SELECT solo-lectura.
 *   2. Abrir la IP del consumidor en el firewall del hub (API Hetzner).
 *   3. Registrar la fila en hub_credentials (libro mayor para revocar después).
 * La password se genera, se devuelve UNA vez y NUNCA se guarda (como api_keys).
 * Revocar = DROP ROLE + quitar IP del firewall + soft-delete de la fila.
 *
 * Seguridad DDL: los nombres de rol y la password NO se pueden parametrizar en
 * SQL. El rol se construye desde un UUID con un prefijo fijo y se valida contra
 * un regex estricto; la password se escapa con comillas dobladas. Nunca se
 * interpola texto del usuario en el DDL.
 */
import { randomUUID, randomBytes } from "crypto";
import { Client } from "pg";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/config/env";
import { serviceUnavailable, badRequest } from "@/lib/errors";
import * as firewall from "@/lib/hetzner-firewall";

const { hubCredentials } = schema;

// Tablas que el consumidor puede leer en el hub. Deben coincidir con la
// PUBLICATION del primario (RFC 0006 §4). GRANT explícito (no "ALL TABLES") para
// que añadir una tabla nueva al hub no la exponga sin decisión.
export const HUB_PUBLIC_COLUMNS = {
  earthquakes: [
    "id", "magnitude", "place", "lat", "lng", "depth_km", "alert", "tsunami",
    "sig", "usgs_updated_at", "occurred_at", "fetched_at",
  ],
  reports: [
    "id", "type", "lat", "lng", "place", "affected", "needs", "confirmations",
    "created_at",
  ],
  hospitals: [
    "id", "external_id", "name", "facility_type", "state", "municipality",
    "address", "level", "priority_zone", "is_priority", "created_at",
  ],
  hospital_supply_statuses: [
    "id", "hospital_id", "category", "status", "public_note",
    "stale_after_hours", "last_updated_at", "last_confirmed_at", "source",
    "created_at",
  ],
  hospital_supply_needs: [
    "id", "hospital_id", "category", "item_type", "quantity", "unit", "urgency",
    "status", "public_note", "last_confirmed_at", "source", "created_at",
    "updated_at",
  ],
  donations: ["id", "amount_usd", "created_at", "status"],
  missing_persons: [
    "id", "age", "nationality", "status", "resolved_at", "external_id", "source",
    "created_at",
  ],
  unidentified_persons: ["id", "status", "created_at"],
  hospital_patients: [
    "id", "hospital_id", "status", "admitted_at", "updated_at",
  ],
  report_confirmations: ["report_id", "created_at"],
} as const;

const CONSUMER_TABLES = Object.keys(HUB_PUBLIC_COLUMNS) as Array<
  keyof typeof HUB_PUBLIC_COLUMNS
>;

const ROLE_RE = /^consumer_[0-9a-f]{32}$/; // forma fija; valida antes de cualquier DDL

export function isConfigured(): boolean {
  return Boolean(env.HUB_ADMIN_DATABASE_URL) && firewall.isConfigured();
}

function assertConfigured(): string {
  if (!env.HUB_ADMIN_DATABASE_URL || !firewall.isConfigured()) {
    throw serviceUnavailable(
      "Gestión de réplica desactivada: faltan HUB_ADMIN_DATABASE_URL / Hetzner.",
    );
  }
  return env.HUB_ADMIN_DATABASE_URL;
}

/** Comillas para un IDENTIFICADOR Postgres (rol/tabla): dobla comillas dobles. */
function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}
/** Comillas para un LITERAL string (password): dobla comillas simples. */
function quoteLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function newRole(): string {
  return `consumer_${randomUUID().replace(/-/g, "")}`;
}
function newPassword(): string {
  return randomBytes(24).toString("base64url"); // ~32 chars alta entropía
}

/** Abre una conexión efímera al hub con el rol CREATEROLE del backend. */
async function withHubAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: assertConfigured() });
  await client.connect();
  try {
    // El hub fuerza `default_transaction_read_only = on` (red de seguridad para
    // consumidores). El rol admin SÍ necesita escribir (CREATE/DROP ROLE, GRANT),
    // así que apagamos el read-only SOLO en esta sesión efímera. Sin esto cada
    // CREATE ROLE falla con 25006 "cannot execute ... in a read-only transaction".
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE");
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Borra un rol del hub de forma segura. Postgres NO deja `DROP ROLE` si el rol
 * aún tiene privilegios concedidos (GRANT SELECT, etc.) o posee objetos: primero
 * hay que `DROP OWNED BY` (quita ownership + revoca todos sus grants en esta DB).
 * Idempotente: si el rol no existe, no falla. `role` ya viene validado contra
 * ROLE_RE por el llamador.
 */
async function dropHubRole(c: Client, role: string): Promise<void> {
  // ¿existe? evita errores sobre un rol inexistente.
  const exists = await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (exists.rowCount === 0) return;
  // Postgres no deja DROP ROLE mientras el rol tenga privilegios concedidos.
  // `DROP OWNED BY` requeriría heredar sus privilegios (no solo admin option), así
  // que en vez de eso REVOCAMOS exactamente lo que otorgamos al emitir — el rol de
  // consumidor solo tiene grants (no posee objetos), así que esto lo deja limpio.
  for (const table of CONSUMER_TABLES) {
    const columns = HUB_PUBLIC_COLUMNS[table].map(quoteIdent).join(", ");
    await c.query(
      `REVOKE SELECT (${columns}) ON ${quoteIdent(table)} FROM ${quoteIdent(role)}`,
    );
  }
  await c.query(`REVOKE ALL ON SCHEMA public FROM ${quoteIdent(role)}`);
  await c.query(`REVOKE ALL ON DATABASE ${quoteIdent(env.HUB_DB_NAME)} FROM ${quoteIdent(role)}`);
  await c.query(`DROP ROLE IF EXISTS ${quoteIdent(role)}`);
}

export interface HubCredentialDTO {
  id: string;
  consumerName: string;
  pgRole: string;
  allowedIp: string;
  createdAt: number;
  revokedAt: number | null;
}

function toDTO(row: typeof hubCredentials.$inferSelect): HubCredentialDTO {
  return {
    id: row.id,
    consumerName: row.consumerName,
    pgRole: row.pgRole,
    allowedIp: row.allowedIp,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  };
}

export interface IssueInput {
  consumerName: string;
  ip: string; // IP o CIDR del consumidor
}

export interface IssuedCredential {
  credential: HubCredentialDTO;
  // Lo que se entrega al consumidor UNA sola vez:
  connection: { host: string; port: number; dbname: string; user: string; password: string };
  psql: string;
}

/**
 * Emite una credencial nueva. Orquesta rol → firewall → fila. Si algo falla,
 * intenta deshacer lo ya hecho (best-effort) para no dejar un rol huérfano o una
 * IP abierta sin credencial.
 */
export async function issueCredential(
  createdBy: string,
  input: IssueInput,
): Promise<IssuedCredential> {
  assertConfigured();
  const role = newRole();
  if (!ROLE_RE.test(role)) throw badRequest("Rol generado inválido."); // defensa
  const password = newPassword();

  // 1) crear rol + grants en el hub
  await withHubAdmin(async (c) => {
    // PG16: el creador (hub_admin, CREATEROLE) recibe ADMIN OPTION IMPLÍCITA
    // sobre los roles que crea, así que luego puede DROP OWNED BY + DROP ROLE sin
    // un GRANT extra (intentar `GRANT rol TO CURRENT_USER` falla: "cannot be
    // granted back to your own grantor"). No añadir esa línea.
    await c.query(
      `CREATE ROLE ${quoteIdent(role)} LOGIN PASSWORD ${quoteLiteral(password)} ` +
        `CONNECTION LIMIT 5`,
    );
    await c.query(`GRANT CONNECT ON DATABASE ${quoteIdent(env.HUB_DB_NAME)} TO ${quoteIdent(role)}`);
    await c.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(role)}`);
    for (const t of CONSUMER_TABLES) {
      const columns = HUB_PUBLIC_COLUMNS[t].map(quoteIdent).join(", ");
      await c.query(
        `GRANT SELECT (${columns}) ON ${quoteIdent(t)} TO ${quoteIdent(role)}`,
      );
    }
    await c.query(`ALTER ROLE ${quoteIdent(role)} SET statement_timeout = '30s'`);
    await c.query(`ALTER ROLE ${quoteIdent(role)} SET default_transaction_read_only = on`);
  });

  // 2) abrir la IP en el firewall. Si falla, deshacer el rol.
  let allowedIp: string;
  try {
    allowedIp = await firewall.allowIp(input.ip);
  } catch (err) {
    await withHubAdmin((c) => dropHubRole(c, role)).catch(() => {});
    throw err;
  }

  // 3) registrar la fila. Si falla, deshacer rol + IP.
  const now = Date.now();
  const row = {
    id: randomUUID(),
    consumerName: input.consumerName.trim(),
    pgRole: role,
    allowedIp,
    hetznerRuleRef: "5432",
    createdBy,
    createdAt: now,
    lastRotatedAt: null,
    revokedAt: null,
    revokedBy: null,
  };
  try {
    await getDb().insert(hubCredentials).values(row);
  } catch (err) {
    await firewall.revokeIp(allowedIp).catch(() => {});
    await withHubAdmin((c) => dropHubRole(c, role)).catch(() => {});
    throw err;
  }

  return {
    credential: toDTO(row as typeof hubCredentials.$inferSelect),
    connection: {
      host: env.HUB_PUBLIC_HOST ?? "<HUB_PUBLIC_HOST>",
      port: 5432,
      dbname: env.HUB_DB_NAME,
      user: role,
      password,
    },
    psql:
      `psql "host=${env.HUB_PUBLIC_HOST ?? "<host>"} port=5432 ` +
      `dbname=${env.HUB_DB_NAME} user=${role} sslmode=verify-full"`,
  };
}

export async function listCredentials(): Promise<HubCredentialDTO[]> {
  const rows = await getDb()
    .select()
    .from(hubCredentials)
    .orderBy(desc(hubCredentials.createdAt));
  return rows.map(toDTO);
}

export async function getCredentialById(
  id: string,
): Promise<typeof hubCredentials.$inferSelect | null> {
  const rows = await getDb()
    .select()
    .from(hubCredentials)
    .where(eq(hubCredentials.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Revoca: DROP ROLE en el hub + cierra la IP en el firewall + soft-delete. Best
 * effort e idempotente — si el rol ya no existe o la IP ya estaba cerrada, sigue.
 */
export async function revokeCredential(id: string, revokedBy: string): Promise<void> {
  const row = await getCredentialById(id);
  if (!row) throw badRequest("Credencial no encontrada.");
  if (!ROLE_RE.test(row.pgRole)) throw badRequest("Rol almacenado inválido."); // defensa
  assertConfigured();

  await withHubAdmin((c) => dropHubRole(c, row.pgRole));
  await firewall.revokeIp(row.allowedIp);
  await getDb()
    .update(hubCredentials)
    .set({ revokedAt: Date.now(), revokedBy })
    .where(and(eq(hubCredentials.id, id), isNull(hubCredentials.revokedAt)));
}
