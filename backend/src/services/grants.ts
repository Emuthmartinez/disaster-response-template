/**
 * Service de grants de capacidad (permisos individuales sobre el rol).
 *
 * Modelo estándar de grants: un grant añade UNA capacidad a un usuario por encima de su
 * rol. Activo = revoked_at NULL && (expires_at NULL || > now). Revocar es
 * inmediato (no viaja en el JWT; el resolver lee fresco).
 *
 * F1 cubre grants a USUARIOS (subjectType="user"). Grants a roles quedan para
 * después (el rol ya agrupa capacidades vía role_capabilities).
 */
import { randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isKnownCapability } from "@/auth/capabilities";
import { badRequest } from "@/lib/errors";

const { permissionGrants, users } = schema;

export interface GrantDTO {
  id: string;
  capabilityKey: string;
  subjectUserId: string | null;
  grantedBy: string;
  grantedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  reason: string;
}

function toDTO(row: typeof permissionGrants.$inferSelect): GrantDTO {
  return {
    id: row.id,
    capabilityKey: row.capabilityKey,
    subjectUserId: row.subjectUserId ?? null,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
    reason: row.reason,
  };
}

/** Lista grants de un usuario (o todos los activos si no se filtra). */
export async function listGrants(filter: { userId?: string }): Promise<GrantDTO[]> {
  const db = getDb();
  const where = filter.userId
    ? eq(permissionGrants.subjectUserId, filter.userId)
    : undefined;
  const rows = await db
    .select()
    .from(permissionGrants)
    .where(where)
    .orderBy(desc(permissionGrants.grantedAt));
  return rows.map(toDTO);
}

export interface CreateGrantInput {
  userId: string;
  capabilityKey: string;
  expiresAt?: number | null;
  reason?: string;
}

export async function grantToUser(input: CreateGrantInput, grantedBy: string): Promise<GrantDTO> {
  if (!isKnownCapability(input.capabilityKey)) {
    throw badRequest(`Capacidad desconocida: ${input.capabilityKey}`);
  }
  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw badRequest("El usuario indicado no existe.");

  // Idempotencia suave: si ya hay un grant activo de esa capacidad, devuélvelo.
  const [active] = await db
    .select()
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.subjectUserId, input.userId),
        eq(permissionGrants.capabilityKey, input.capabilityKey),
        isNull(permissionGrants.revokedAt),
      ),
    )
    .limit(1);
  if (active) return toDTO(active);

  const row = {
    id: randomUUID(),
    capabilityKey: input.capabilityKey,
    subjectType: "user" as const,
    subjectUserId: input.userId,
    grantedBy,
    grantedAt: Date.now(),
    expiresAt: input.expiresAt ?? null,
    reason: input.reason ?? "",
  };
  await db.insert(permissionGrants).values(row);
  return {
    id: row.id,
    capabilityKey: row.capabilityKey,
    subjectUserId: row.subjectUserId,
    grantedBy: row.grantedBy,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: null,
    reason: row.reason,
  };
}

/** Revoca un grant (revoked_at=now). Idempotente. false = no existe. */
export async function revokeGrant(id: string, revokedBy: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db.select().from(permissionGrants).where(eq(permissionGrants.id, id)).limit(1);
  if (!existing) return false;
  if (existing.revokedAt) return true; // ya revocado
  await db
    .update(permissionGrants)
    .set({ revokedAt: Date.now(), revokedBy })
    .where(eq(permissionGrants.id, id));
  return true;
}
