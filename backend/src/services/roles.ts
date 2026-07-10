/**
 * Service de roles RBAC. La lógica + Drizzle viven aquí; el router se genera
 * desde roles.resource.ts sobre la fábrica CRUD.
 *
 * Un rol agrupa capacidades (tabla M:N role_capabilities). create/update son
 * "custom" porque manejan esa lista hija de forma transaccional. Los roles
 * `isSystem` (p.ej. el semilla 'admin') NO se pueden editar ni borrar por API —
 * evita que alguien se deje fuera quitándole capacidades al admin.
 */
import { randomUUID } from "crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isKnownCapability } from "@/auth/capabilities";
import { badRequest, forbidden } from "@/lib/errors";

const { roles, roleCapabilities } = schema;

/** DTO público de un rol (allowlist + sus capacidades). */
export interface RoleDTO {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  capabilities: string[];
  createdAt: number;
  updatedAt: number | null;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  capabilities: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  capabilities?: string[];
}

/** Valida que TODA capacidad exista en el catálogo. Lanza 400 si alguna es desconocida. */
function assertKnownCapabilities(caps: string[]): void {
  const unknown = caps.filter((c) => !isKnownCapability(c));
  if (unknown.length > 0) {
    throw badRequest(`Capacidades desconocidas: ${unknown.join(", ")}`);
  }
}

async function capabilitiesFor(roleIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (roleIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select()
    .from(roleCapabilities)
    .where(inArray(roleCapabilities.roleId, roleIds));
  for (const r of rows) {
    const list = map.get(r.roleId) ?? [];
    list.push(r.capabilityKey);
    map.set(r.roleId, list);
  }
  return map;
}

function toDTO(
  row: typeof roles.$inferSelect,
  caps: string[],
): RoleDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    capabilities: caps.sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function listRoles(): Promise<RoleDTO[]> {
  const db = getDb();
  const rows = await db.select().from(roles).orderBy(asc(roles.name));
  const caps = await capabilitiesFor(rows.map((r) => r.id));
  return rows.map((r) => toDTO(r, caps.get(r.id) ?? []));
}

export async function getRoleById(id: string): Promise<RoleDTO | null> {
  const db = getDb();
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!row) return null;
  const caps = await capabilitiesFor([id]);
  return toDTO(row, caps.get(id) ?? []);
}

export async function createRole(input: CreateRoleInput): Promise<RoleDTO> {
  assertKnownCapabilities(input.capabilities);
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.insert(roles).values({
      id,
      name: input.name,
      description: input.description ?? "",
      isSystem: false, // los roles creados por API nunca son de sistema
      // createdBy se deja null: el "quién" autoritativo es el audit_log (role.create).
      createdAt: now,
      updatedAt: now,
    });
    if (input.capabilities.length > 0) {
      await tx.insert(roleCapabilities).values(
        dedupe(input.capabilities).map((capabilityKey) => ({ roleId: id, capabilityKey })),
      );
    }
  });

  return toDTO(
    {
      id,
      name: input.name,
      description: input.description ?? "",
      isSystem: false,
      orgId: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    },
    dedupe(input.capabilities),
  );
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleDTO | null> {
  const db = getDb();
  const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!existing) return null;
  if (existing.isSystem) {
    throw forbidden("Los roles de sistema no se pueden editar.");
  }
  if (input.capabilities) assertKnownCapabilities(input.capabilities);

  const now = Date.now();
  await db.transaction(async (tx) => {
    const patch: Partial<typeof roles.$inferInsert> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    await tx.update(roles).set(patch).where(eq(roles.id, id));

    if (input.capabilities) {
      // Reemplazo total de la lista (idempotente y simple).
      await tx.delete(roleCapabilities).where(eq(roleCapabilities.roleId, id));
      const caps = dedupe(input.capabilities);
      if (caps.length > 0) {
        await tx
          .insert(roleCapabilities)
          .values(caps.map((capabilityKey) => ({ roleId: id, capabilityKey })));
      }
    }
  });

  return getRoleById(id);
}

export async function removeRole(id: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!existing) return false;
  if (existing.isSystem) {
    throw forbidden("Los roles de sistema no se pueden eliminar.");
  }
  // Impedir borrar un rol aún asignado a usuarios (FK app-side).
  const [assigned] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.roleId, id))
    .limit(1);
  if (assigned) {
    throw badRequest("El rol está asignado a uno o más usuarios. Reasígnalos antes de eliminarlo.");
  }

  await db.transaction(async (tx) => {
    await tx.delete(roleCapabilities).where(eq(roleCapabilities.roleId, id));
    await tx.delete(roles).where(eq(roles.id, id));
  });
  return true;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
