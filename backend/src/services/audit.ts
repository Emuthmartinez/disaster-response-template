/**
 * Service de lectura de la bitácora de auditoría (audit_log).
 *
 * Solo lectura: la escritura la hace writeAudit (auth/audit.ts) en cada
 * mutación sensible. Aquí exponemos un listado paginado (más reciente primero),
 * opcionalmente filtrado por actor o por target.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { auditLog } = schema;

export interface AuditEntryDTO {
  id: number;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: number;
}

function toDTO(row: typeof auditLog.$inferSelect): AuditEntryDTO {
  return {
    id: row.id,
    actorUserId: row.actorUserId ?? null,
    action: row.action,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    // ip_hash se OMITE a propósito del DTO (privacidad).
  };
}

export interface ListAuditFilter {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  /** Cursor: solo entradas con id < before (paginación keyset). */
  before?: number;
  limit?: number;
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function listAudit(filter: ListAuditFilter): Promise<AuditEntryDTO[]> {
  const db = getDb();
  const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const conds = [];
  if (filter.actorUserId) conds.push(eq(auditLog.actorUserId, filter.actorUserId));
  if (filter.targetType) conds.push(eq(auditLog.targetType, filter.targetType));
  if (filter.targetId) conds.push(eq(auditLog.targetId, filter.targetId));
  if (filter.before) conds.push(lt(auditLog.id, filter.before));

  const rows = await db
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.map(toDTO);
}
