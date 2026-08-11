/**
 * Service de solicitudes de eliminación de datos personales (GDPR/CCPA).
 * Sigue el mismo patrón que contact.ts: inserta la solicitud persistiendo el
 * HASH de IP (nunca la IP cruda), devuelve solo el id y expone DTOs sin
 * ip_hash en las listas.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { dataDeletionRequests } = schema;

/** Solicitud expuesta al admin. Allowlist: NUNCA incluye ip_hash. */
export interface DeletionRequestDTO {
  id: string;
  name: string;
  email: string;
  details: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export async function createDeletionRequest(input: {
  name: string;
  email: string;
  details?: string | null;
  ipHash?: string | null;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const db = await getDb();
  await db.insert(dataDeletionRequests).values({
    id,
    name: input.name,
    email: input.email,
    details: input.details ?? null,
    status: "pending",
    ipHash: input.ipHash ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

/** Lista de solicitudes para el panel admin (DTO allowlist, sin ip_hash). */
export async function listDeletionRequests(): Promise<DeletionRequestDTO[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: dataDeletionRequests.id,
      name: dataDeletionRequests.name,
      email: dataDeletionRequests.email,
      details: dataDeletionRequests.details,
      status: dataDeletionRequests.status,
      createdAt: dataDeletionRequests.createdAt,
      updatedAt: dataDeletionRequests.updatedAt,
    })
    .from(dataDeletionRequests)
    .orderBy(desc(dataDeletionRequests.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    details: r.details,
    status: r.status,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  }));
}

/** Estados válidos de una solicitud de eliminación. */
export const DELETION_REQUEST_STATUSES = ["pending", "resolved", "rejected"] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

/**
 * Cambia el estado de una solicitud (panel admin). Devuelve el DTO actualizado
 * o null si no existe. La decisión queda además en audit_log (lo escribe el
 * router con writeAudit).
 */
export async function updateDeletionRequestStatus(
  id: string,
  status: DeletionRequestStatus,
): Promise<DeletionRequestDTO | null> {
  const db = await getDb();
  const rows = await db
    .update(dataDeletionRequests)
    .set({ status, updatedAt: Date.now() })
    .where(eq(dataDeletionRequests.id, id))
    .returning({
      id: dataDeletionRequests.id,
      name: dataDeletionRequests.name,
      email: dataDeletionRequests.email,
      details: dataDeletionRequests.details,
      status: dataDeletionRequests.status,
      createdAt: dataDeletionRequests.createdAt,
      updatedAt: dataDeletionRequests.updatedAt,
    });
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    details: row.details,
    status: row.status,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}
