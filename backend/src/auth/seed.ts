/**
 * Seed idempotente del motor de auth. Corre tras `migrate()` en el Job gateado.
 *
 *   1. Sincroniza la tabla `capabilities` con el catálogo de código (upsert de
 *      las nuevas; las que sobren se dejan — borrarlas podría romper grants).
 *   2. Garantiza el rol semilla "admin" (is_system=true) con TODAS las capacidades.
 *      Re-corre = re-vincula cualquier capacidad nueva al admin (siempre total).
 *   3. Si SEED_ADMIN_EMAIL está set y ese usuario no existe, crea el primer
 *      superadmin. Con SEED_ADMIN_PASSWORD -> activo; sin ella -> queda "invited"
 *      (se activa por el flujo de invitación). Nunca pisa un usuario existente.
 *
 * Env: SEED_ADMIN_EMAIL (opcional), SEED_ADMIN_PASSWORD (opcional).
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CAPABILITIES, SYSTEM_ADMIN_ROLE, MIRROR_MANAGE } from "@/auth/capabilities";
import { hashPassword } from "@/auth/password";

export async function seedAuth(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  // 1) Catálogo de capacidades (upsert por key).
  for (const cap of CAPABILITIES) {
    await db
      .insert(schema.capabilities)
      .values({ key: cap.key, description: cap.description, category: cap.category })
      .onConflictDoUpdate({
        target: schema.capabilities.key,
        set: { description: cap.description, category: cap.category },
      });
  }
  console.log(`[seed] ${CAPABILITIES.length} capacidades sincronizadas.`);

  // 2) Rol semilla "admin" con TODAS las capacidades.
  const existing = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(sql`${schema.roles.name} = ${SYSTEM_ADMIN_ROLE} AND ${schema.roles.orgId} IS NULL`)
    .limit(1);

  let adminRoleId: string;
  if (existing[0]) {
    adminRoleId = existing[0].id;
  } else {
    adminRoleId = randomUUID();
    await db.insert(schema.roles).values({
      id: adminRoleId,
      name: SYSTEM_ADMIN_ROLE,
      description: "Administrador total (rol semilla del sistema, inmutable).",
      isSystem: true,
      orgId: null,
      createdBy: null,
      createdAt: now,
    });
    console.log("[seed] rol 'admin' creado.");
  }

  // Re-vincula TODAS las capacidades al admin (incluye las nuevas en cada deploy),
  // EXCEPTO mirror:manage: esa NO se concede vía rol — está gateada por el flag
  // is_super_admin (corte en auth/resolve.ts). Dejarla fuera del bundle evita un
  // grant inerte que se activaría por error si el corte se quitara. RFC 0006.
  for (const cap of CAPABILITIES) {
    if (cap.key === MIRROR_MANAGE) continue;
    await db
      .insert(schema.roleCapabilities)
      .values({ roleId: adminRoleId, capabilityKey: cap.key })
      .onConflictDoNothing();
  }
  console.log("[seed] rol 'admin' con todas las capacidades (salvo mirror:manage).");

  // Auto-sanación: quita cualquier grant de mirror:manage en CUALQUIER rol (p.ej.
  // sembrado por una versión anterior del seed). Debe estar SOLO tras el flag
  // is_super_admin, nunca en un rol. RFC 0006.
  await db
    .delete(schema.roleCapabilities)
    .where(sql`${schema.roleCapabilities.capabilityKey} = ${MIRROR_MANAGE}`);

  // 2b) `apikey:manage` es self-service: TODO rol la lleva, para que cualquier
  // usuario invitado (cualquier rol) pueda crear/revocar SUS PROPIAS API keys.
  // Idempotente (onConflictDoNothing). Solo añade; nunca quita lo que un admin
  // haya configurado a mano en un rol.
  const allRoles = await db.select({ id: schema.roles.id }).from(schema.roles);
  for (const r of allRoles) {
    await db
      .insert(schema.roleCapabilities)
      .values({ roleId: r.id, capabilityKey: "apikey:manage" })
      .onConflictDoNothing();
  }
  console.log(`[seed] apikey:manage sembrada en ${allRoles.length} rol(es).`);

  // 3) Primer superadmin (opcional, no destructivo).
  const seedEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (seedEmail) {
    const found = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${seedEmail}`)
      .limit(1);
    if (found[0]) {
      // Idempotente: asegura que el admin semilla sea SUPER admin (único con
      // mirror:manage, gestiona la réplica pública). Ver RFC 0006.
      await db
        .update(schema.users)
        .set({ isSuperAdmin: true })
        .where(sql`${schema.users.id} = ${found[0].id}`);
      console.log(`[seed] superadmin ${seedEmail} ya existe — is_super_admin asegurado.`);
    } else {
      const seedPassword = process.env.SEED_ADMIN_PASSWORD;
      const passwordHash = seedPassword ? await hashPassword(seedPassword) : null;
      await db.insert(schema.users).values({
        id: randomUUID(),
        email: seedEmail,
        name: "Superadmin",
        passwordHash,
        roleId: adminRoleId,
        orgId: null,
        status: passwordHash ? "active" : "invited",
        // El admin semilla ES super admin (único con mirror:manage). RFC 0006.
        isSuperAdmin: true,
        createdAt: now,
      });
      console.log(
        `[seed] superadmin ${seedEmail} creado (${passwordHash ? "activo" : "invited — actívalo por invitación"}).`,
      );
    }
  }
}
