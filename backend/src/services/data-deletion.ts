/**
 * Service de solicitudes de eliminación de datos personales (GDPR/CCPA).
 * Sigue el mismo patrón que contact.ts: inserta la solicitud persistiendo el
 * HASH de IP (nunca la IP cruda), devuelve solo el id y expone DTOs sin
 * ip_hash en las listas.
 */
import { desc } from "drizzle-orm";
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
