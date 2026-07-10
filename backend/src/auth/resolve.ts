/**
 * Resolución de capacidades — el punto ÚNICO de decisión de autorización
 * (portado de un `user_has_capability` estándar). Toda comprobación de permisos pasa
 * por `userHasCapability`. Reglas, en orden:
 *
 *   1. Rol semilla "admin" (is_system)  -> TRUE para todo (short-circuit).
 *   2. La capacidad está en el bundle del rol del usuario (role_capabilities) -> TRUE.
 *   3. Hay un grant individual ACTIVO (no revocado, no expirado) para el usuario
 *      o para su rol con esa capacidad -> TRUE.
 *   4. En cualquier otro caso -> FALSE (deny-by-default).
 *
 * Cache por-request: un Map colgado de `req` evita doble query en un mismo
 * handler. Sin viajar en el JWT, la revocación de un rol/grant es INMEDIATA
 * (cada request relee la DB) — evita la ventana de revocación del audit.
 *
 * Tenancy (fase 2): cuando `orgId` se use, el filtro de scope entra aquí (el
 * grant/rol debe ser global o de la misma org). Hoy todo es global (orgId NULL).
 */
import { and, eq, isNull, or, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MIRROR_MANAGE } from "@/auth/capabilities";

export interface AuthUser {
  id: string;
  email: string;
  roleId: string | null;
  orgId: string | null;
  status: string;
  /** True si su rol es el semilla "admin" (is_system). */
  isSystemAdmin: boolean;
  /**
   * True si es SUPER admin (users.is_super_admin): tier por encima del admin
   * semilla. Único que puede `mirror:manage` (gestionar la réplica pública). El
   * corte en userHasCapability exige este flag para esa capacidad — ni el admin
   * semilla pasa sin él. Ver RFC 0006.
   */
  isSuperAdmin: boolean;
  /**
   * Si la sesión se autenticó con una API KEY, aquí van los scopes de esa llave
   * (subconjunto de capabilities). El permiso efectivo se ACOTA a este set: una
   * capacidad solo pasa si está en los scopes Y el usuario la tiene de verdad —
   * incluso para el admin semilla. `undefined` = sesión normal (JWT/cookie), sin
   * acotar. Es lo que hace que una llave sea least-privilege y no un alias total
   * del usuario.
   */
  apiKeyScopes?: string[];
}

/** Cache de capacidades por-request (clave = capability key -> bool). */
type CapCache = Map<string, boolean>;

/** Carga el usuario + si su rol es el semilla admin. null si no existe/desactivado. */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      roleId: schema.users.roleId,
      orgId: schema.users.orgId,
      status: schema.users.status,
      isSystem: schema.roles.isSystem,
      isSuperAdmin: schema.users.isSuperAdmin,
    })
    .from(schema.users)
    .leftJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(eq(schema.users.id, userId))
    .limit(1);

  const u = rows[0];
  if (!u || u.status !== "active") return null;
  return {
    id: u.id,
    email: u.email,
    roleId: u.roleId,
    orgId: u.orgId,
    status: u.status,
    isSystemAdmin: Boolean(u.isSystem),
    isSuperAdmin: Boolean(u.isSuperAdmin),
  };
}

/**
 * ¿`user` tiene `capability` ahora mismo? Lee fresco de la DB (con cache por
 * request). Esta es la función que TODO el sistema debe usar.
 */
export async function userHasCapability(
  user: AuthUser,
  capability: string,
  cache?: CapCache,
): Promise<boolean> {
  // 0) Techo de API key: si la sesión es por llave, la capacidad DEBE estar en
  // sus scopes — aun para el admin semilla. Esto hace la llave least-privilege
  // (no un alias total). Va ANTES del short-circuit de admin a propósito.
  if (user.apiKeyScopes && !user.apiKeyScopes.includes(capability)) return false;

  // 0.5) Corte de super admin: `mirror:manage` (gestionar la réplica pública) es
  // la capacidad más sensible. Se exige el flag is_super_admin INCLUSO al admin
  // semilla — por eso va ANTES de su short-circuit. Así un admin normal no puede
  // abrir el puerto público ni crear credenciales de DB.
  if (capability === MIRROR_MANAGE) return user.isSuperAdmin === true;

  // 1) Admin semilla: todo (lo que el techo de scope no haya cortado ya).
  if (user.isSystemAdmin) return true;

  if (cache?.has(capability)) return cache.get(capability)!;

  const has = await resolveFromDb(user, capability);
  cache?.set(capability, has);
  return has;
}

async function resolveFromDb(user: AuthUser, capability: string): Promise<boolean> {
  const db = getDb();

  // 2) ¿Está en el bundle del rol del usuario?
  if (user.roleId) {
    const inRole = await db
      .select({ k: schema.roleCapabilities.capabilityKey })
      .from(schema.roleCapabilities)
      .where(
        and(
          eq(schema.roleCapabilities.roleId, user.roleId),
          eq(schema.roleCapabilities.capabilityKey, capability),
        ),
      )
      .limit(1);
    if (inRole.length > 0) return true;
  }

  // 3) ¿Hay un grant individual ACTIVO (user o su rol) para esta capacidad?
  const now = Date.now();
  const activeWindow = or(
    isNull(schema.permissionGrants.expiresAt),
    gt(schema.permissionGrants.expiresAt, now),
  );
  // Sujeto: el propio usuario, o su rol (si tiene uno).
  const subjectMatch = user.roleId
    ? or(
        and(
          eq(schema.permissionGrants.subjectType, "user"),
          eq(schema.permissionGrants.subjectUserId, user.id),
        ),
        and(
          eq(schema.permissionGrants.subjectType, "role"),
          eq(schema.permissionGrants.subjectRoleId, user.roleId),
        ),
      )
    : and(
        eq(schema.permissionGrants.subjectType, "user"),
        eq(schema.permissionGrants.subjectUserId, user.id),
      );

  const grant = await db
    .select({ id: schema.permissionGrants.id })
    .from(schema.permissionGrants)
    .where(
      and(
        eq(schema.permissionGrants.capabilityKey, capability),
        isNull(schema.permissionGrants.revokedAt),
        activeWindow,
        subjectMatch,
      ),
    )
    .limit(1);

  return grant.length > 0;
}

/**
 * Devuelve TODAS las capacidades efectivas del usuario (rol + grants activos).
 * Para el endpoint /me y la UI. El admin semilla devuelve "*" como marcador.
 */
export async function effectiveCapabilities(user: AuthUser): Promise<string[]> {
  // El admin semilla devuelve "*" (comodín). PERO `mirror:manage` está fuera del
  // comodín: solo aparece si is_super_admin. Así la UI gatea la pestaña de la
  // réplica por la presencia EXPLÍCITA de mirror:manage, no por "*" — un admin
  // normal con "*" NO la verá. El gate real igual está en userHasCapability.
  if (user.isSystemAdmin) return user.isSuperAdmin ? ["*", MIRROR_MANAGE] : ["*"];
  const db = getDb();
  const fromRole = user.roleId
    ? await db
        .select({ k: schema.roleCapabilities.capabilityKey })
        .from(schema.roleCapabilities)
        .where(eq(schema.roleCapabilities.roleId, user.roleId))
    : [];

  const now = Date.now();
  const subjectIds = [user.id];
  const grants = await db
    .select({ k: schema.permissionGrants.capabilityKey })
    .from(schema.permissionGrants)
    .where(
      and(
        isNull(schema.permissionGrants.revokedAt),
        or(isNull(schema.permissionGrants.expiresAt), gt(schema.permissionGrants.expiresAt, now)),
        or(
          and(
            eq(schema.permissionGrants.subjectType, "user"),
            inArray(schema.permissionGrants.subjectUserId, subjectIds),
          ),
          user.roleId
            ? and(
                eq(schema.permissionGrants.subjectType, "role"),
                eq(schema.permissionGrants.subjectRoleId, user.roleId),
              )
            : undefined,
        ),
      ),
    );

  const set = new Set<string>();
  for (const r of fromRole) set.add(r.k);
  for (const g of grants) set.add(g.k);
  return [...set].sort();
}
