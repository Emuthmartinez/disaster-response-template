/**
 * Helpers de test de integración. Levantan la app real (supertest, sin puerto)
 * contra el Postgres/Valkey LOCAL, siembran el motor de auth y fabrican usuarios
 * con roles/capacidades concretos + sus tokens. Espeja un enfoque estándar de
 * test_authz_matrix: se asierta AUTORIZACIÓN, no lógica de negocio.
 *
 * Requiere el stack local arriba (docker compose up): DATABASE_URL + VALKEY_URL.
 * El env de test se fija aquí ANTES de importar la app (config/env lee process.env
 * al cargar).
 */
import { randomUUID } from "crypto";

// --- Env de test (debe fijarse ANTES de importar la app / config/env) ---
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://mapa_app:localdev@localhost:5432/app";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-not-for-prod-0123456789";
process.env.PATIENT_DOCUMENT_HASH_SECRET =
  process.env.PATIENT_DOCUMENT_HASH_SECRET ?? "test-patient-document-hash-secret-0123456789";
process.env.VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6379";
// TRUSTED_IP_HEADER default (producción) es "" (sin proxy delante). El suite
// necesita simular IPs ficticias distintas por request (rate-limit,
// dedup por ip_hash) sin depender de la IP real del socket de supertest, así
// que aquí optamos EXPLÍCITAMENTE por confiar en cf-connecting-ip, como haría
// un deploy real detrás de Cloudflare — mismo mecanismo, solo que declarado
// a propósito para el test en vez de asumido por el entorno.
process.env.TRUSTED_IP_HEADER = process.env.TRUSTED_IP_HEADER ?? "cf-connecting-ip";
// El suite golpea los mismos endpoints muchas veces desde la misma IP → sin esto
// los rate-limits dispararían 429 y harían flaky la matriz. Solo en test.
process.env.RATE_LIMIT_DISABLED = "1";
// Sin SMTP en test → invite devuelve el link, reset loguea el OTP (no se manda).

/**
 * PNG transparente de 1x1 como data-URL — imagen SINTÉTICA válida (pasa la
 * allowlist jpeg/png/webp de lib/image.ts). Sirve para subir una foto REAL en
 * los tests y luego verificar que la respuesta pública expone solo `photoUrl`,
 * nunca la columna `photo` cruda (base64).
 */
export const SYNTHETIC_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Claves que NUNCA deben aparecer en un cuerpo de respuesta pública (contexto
 * humanitario): la columna `photo` cruda (base64), el hash/IP del remitente, el
 * user-agent y el correo. Las rutas exponen solo DTOs con allowlist (p.ej.
 * `photoUrl` derivada en vez de `photo`). Complementa el issue #35 (redacción).
 */
const FORBIDDEN_PUBLIC_KEYS = [
  "photo",
  "ip_hash",
  "ipHash",
  "user_agent",
  "userAgent",
  "email",
  "passwordHash",
  "password_hash",
] as const;

/**
 * Asierta que `value` (y todo objeto anidado) no expone ninguna CLAVE sensible.
 * Veta por NOMBRE de clave: un DTO público puede tener `contact` (público por
 * diseño en la ficha de desaparecido) sin disparar nada, porque no es una clave
 * `email`/`ip_hash`/etc. de la lista.
 */
export function expectNoSensitiveFields(value: unknown): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        if (FORBIDDEN_PUBLIC_KEYS.includes(key as (typeof FORBIDDEN_PUBLIC_KEYS)[number])) {
          throw new Error(`La respuesta pública filtró el campo sensible "${key}".`);
        }
        walk(child);
      }
    }
  };
  walk(value);
}

/** Token JWT para un userId (firma con el mismo JWT_SECRET de la app). */
export async function tokenFor(userId: string): Promise<string> {
  const { signToken } = await import("@/auth/jwt");
  return signToken(userId);
}

/** Garantiza que el catálogo + rol admin existan (idempotente). */
export async function ensureSeed(): Promise<void> {
  const { seedAuth } = await import("@/auth/seed");
  await seedAuth();
}

interface MadeUser {
  id: string;
  email: string;
  roleId: string | null;
}

/**
 * Crea un rol con un conjunto exacto de capacidades + un usuario activo con ese
 * rol. Devuelve el user (con id) y su token. roleCaps=[] => rol sin permisos.
 */
export async function makeUserWithCaps(caps: string[]): Promise<MadeUser & { token: string }> {
  const { getDb, schema } = await import("@/db");
  const db = getDb();
  const now = Date.now();
  const roleId = randomUUID();
  const roleName = `test-role-${roleId.slice(0, 8)}`;
  await db.insert(schema.roles).values({
    id: roleId,
    name: roleName,
    description: "rol de test",
    isSystem: false,
    createdAt: now,
  });
  for (const c of caps) {
    await db
      .insert(schema.roleCapabilities)
      .values({ roleId, capabilityKey: c })
      .onConflictDoNothing();
  }
  const id = randomUUID();
  const email = `u-${id.slice(0, 8)}@test.local`;
  await db.insert(schema.users).values({
    id,
    email,
    name: "Test User",
    passwordHash: null,
    roleId,
    status: "active",
    createdAt: now,
  });
  const token = await tokenFor(id);
  return { id, email, roleId, token };
}

/** Crea el superadmin (rol semilla "admin") activo + token. */
export async function makeAdmin(): Promise<MadeUser & { token: string }> {
  const { getDb, schema } = await import("@/db");
  const { hashPassword } = await import("@/auth/password");
  const db = getDb();
  const { eq } = await import("drizzle-orm");
  const adminRole = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.isSystem, true))
    .limit(1);
  const roleId = adminRole[0]!.id;
  const id = randomUUID();
  const email = `admin-${id.slice(0, 8)}@test.local`;
  await db.insert(schema.users).values({
    id,
    email,
    name: "Admin",
    passwordHash: await hashPassword("adminpass123"),
    roleId,
    status: "active",
    createdAt: Date.now(),
  });
  return { id, email, roleId, token: await tokenFor(id) };
}
