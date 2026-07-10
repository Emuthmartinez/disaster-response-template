/**
 * Service de gestión de usuarios autenticados (admin RBAC).
 *
 * Verbos irregulares (invite/read/edit/delete) → router escrito a mano, no la
 * fábrica CRUD. `invite` ya vive en routes/auth.ts. Aquí: read/edit/delete.
 *
 * "delete" es SOFT: status→disabled (no se borra la fila; preserva auditoría e
 * integridad de referencias). NUNCA expone password_hash.
 */
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { badRequest } from "@/lib/errors";

const { users, roles } = schema;

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  roleId: string | null;
  status: string; // invited | active | disabled
  createdAt: number;
  lastLoginAt: number | null;
}

function toDTO(row: typeof users.$inferSelect): UserDTO {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleId: row.roleId ?? null,
    status: row.status,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt ?? null,
  };
}

export async function listUsers(): Promise<UserDTO[]> {
  const db = getDb();
  const rows = await db.select().from(users).orderBy(asc(users.email));
  return rows.map(toDTO);
}

export async function getUserById(id: string): Promise<UserDTO | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toDTO(row) : null;
}

export interface UpdateUserInput {
  roleId?: string | null;
  status?: "active" | "disabled";
  name?: string;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDTO | null> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return null;

  // Si se asigna un rol, debe existir.
  if (input.roleId) {
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) throw badRequest("El rol indicado no existe.");
  }

  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.roleId !== undefined) patch.roleId = input.roleId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.name !== undefined) patch.name = input.name;

  await db.update(users).set(patch).where(eq(users.id, id));
  return getUserById(id);
}

/** Soft-delete: desactiva al usuario (status=disabled). Idempotente. */
export async function deactivateUser(id: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return false;
  await db.update(users).set({ status: "disabled" }).where(eq(users.id, id));
  return true;
}
