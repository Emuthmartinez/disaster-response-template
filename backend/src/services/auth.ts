/**
 * Lógica del flujo de cuentas: invitación → aceptación → login. El route solo
 * orquesta middleware + llama aquí; toda la DB vive en este service.
 */
import { randomUUID, randomBytes, createHash } from "crypto";
import { and, eq, isNull, sql, gt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/config/env";
import { hashPassword, verifyPassword } from "@/auth/password";

/** sha256 del token de invitación — solo guardamos el hash, nunca el token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateInviteInput {
  email: string;
  roleId: string | null;
  invitedBy: string;
}

export class ActiveAccountInvitationError extends Error {
  constructor() {
    super("La cuenta ya está activa.");
    this.name = "ActiveAccountInvitationError";
  }
}

/** Crea una invitación y devuelve el token EN CLARO (solo aquí; se envía por email). */
export async function createInvitation(
  input: CreateInviteInput,
): Promise<{ id: string; token: string; expiresAt: number }> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);
  if (existing[0]?.status === "active") throw new ActiveAccountInvitationError();

  // Si el rol existe, validarlo (no se puede invitar a un rol inexistente).
  if (input.roleId) {
    const r = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.id, input.roleId))
      .limit(1);
    if (!r[0]) throw new Error("ROLE_NOT_FOUND");
  }

  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + env.INVITE_TTL_HOURS * 3_600_000;
  const id = randomUUID();

  await db.insert(schema.invitations).values({
    id,
    email,
    roleId: input.roleId,
    orgId: null,
    tokenHash: hashToken(token),
    invitedBy: input.invitedBy,
    createdAt: now,
    expiresAt,
  });

  // Pre-crea el usuario invitado; cuentas no activas existentes se reutilizan.
  if (!existing[0]) {
    await db.insert(schema.users).values({
      id: randomUUID(),
      email,
      roleId: input.roleId,
      status: "invited",
      createdAt: now,
    });
  }

  return { id, token, expiresAt };
}

export interface InvitationView {
  email: string;
  roleId: string | null;
  expiresAt: number;
}

/** Valida un token de invitación; null si no existe / expiró / ya se usó. */
export async function getValidInvitation(token: string): Promise<InvitationView | null> {
  const db = getDb();
  const now = Date.now();
  const rows = await db
    .select({
      email: schema.invitations.email,
      roleId: schema.invitations.roleId,
      expiresAt: schema.invitations.expiresAt,
    })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.tokenHash, hashToken(token)),
        isNull(schema.invitations.acceptedAt),
        gt(schema.invitations.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Acepta una invitación: fija contraseña, activa la cuenta. Devuelve el user.id. */
export async function acceptInvitation(
  token: string,
  password: string,
  name?: string,
): Promise<{ userId: string } | null> {
  const db = getDb();
  const now = Date.now();
  const inv = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      roleId: schema.invitations.roleId,
    })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.tokenHash, hashToken(token)),
        isNull(schema.invitations.acceptedAt),
        gt(schema.invitations.expiresAt, now),
      ),
    )
    .limit(1);
  if (!inv[0]) return null;

  const passwordHash = await hashPassword(password);

  // Activa (o crea) el usuario de esa invitación.
  const existing = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${inv[0].email}`)
    .limit(1);
  if (existing[0]?.status === "active") throw new ActiveAccountInvitationError();

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    const activated = await db
      .update(schema.users)
      .set({ passwordHash, roleId: inv[0].roleId, status: "active", name: name ?? "" })
      .where(and(eq(schema.users.id, userId), ne(schema.users.status, "active")))
      .returning({ id: schema.users.id });
    if (!activated[0]) throw new ActiveAccountInvitationError();
  } else {
    userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      email: inv[0].email,
      name: name ?? "",
      passwordHash,
      roleId: inv[0].roleId,
      status: "active",
      createdAt: now,
    });
  }

  await db
    .update(schema.invitations)
    .set({ acceptedAt: now })
    .where(eq(schema.invitations.id, inv[0].id));

  return { userId };
}

/* --------------------------------------------------- recuperación por OTP */

const OTP_TTL_MS = 15 * 60_000; // 15 min
const OTP_MAX_ATTEMPTS = 5; // intentos de código por solicitud

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Genera un OTP de 6 dígitos (criptográficamente aleatorio). */
function generateOtp(): string {
  // 000000–999999, sin sesgo (rechazo del rango sobrante de 32 bits no necesario
  // a esta escala; usamos un entero uniforme de 1e6).
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Inicia la recuperación: si el email corresponde a un usuario activo, crea un
 * OTP y lo devuelve EN CLARO (solo aquí; el caller lo envía por email). Si no
 * existe, devuelve null — el endpoint responde IGUAL en ambos casos (no filtra
 * si el email existe). Invalida OTPs previos no usados del mismo usuario.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ userId: string; code: string } | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  const u = rows[0];
  if (!u || u.status !== "active") return null;

  const now = Date.now();
  // Invalida OTPs anteriores sin consumir (uno activo a la vez).
  await db
    .update(schema.passwordResets)
    .set({ consumedAt: now })
    .where(and(eq(schema.passwordResets.userId, u.id), isNull(schema.passwordResets.consumedAt)));

  const code = generateOtp();
  await db.insert(schema.passwordResets).values({
    id: randomUUID(),
    userId: u.id,
    codeHash: hashCode(code),
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
  });
  return { userId: u.id, code };
}

/**
 * Confirma el reset: valida email+OTP y, si es correcto, fija la nueva
 * contraseña. Cuenta intentos (anti fuerza-bruta del código). Devuelve el
 * user.id o null (código inválido/expirado/agotado).
 */
export async function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ userId: string } | null> {
  const db = getDb();
  const now = Date.now();
  const userRows = await db
    .select({ id: schema.users.id, status: schema.users.status })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  const u = userRows[0];
  if (!u || u.status !== "active") return null;

  const prRows = await db
    .select({
      id: schema.passwordResets.id,
      codeHash: schema.passwordResets.codeHash,
      attempts: schema.passwordResets.attempts,
    })
    .from(schema.passwordResets)
    .where(
      and(
        eq(schema.passwordResets.userId, u.id),
        isNull(schema.passwordResets.consumedAt),
        gt(schema.passwordResets.expiresAt, now),
      ),
    )
    .orderBy(sql`${schema.passwordResets.createdAt} DESC`)
    .limit(1);
  const pr = prRows[0];
  if (!pr) return null;

  // Demasiados intentos: quema el OTP.
  if (pr.attempts >= OTP_MAX_ATTEMPTS) {
    await db
      .update(schema.passwordResets)
      .set({ consumedAt: now })
      .where(eq(schema.passwordResets.id, pr.id));
    return null;
  }

  if (pr.codeHash !== hashCode(code)) {
    await db
      .update(schema.passwordResets)
      .set({ attempts: pr.attempts + 1 })
      .where(eq(schema.passwordResets.id, pr.id));
    return null;
  }

  // OK: fija contraseña + consume el OTP.
  const passwordHash = await hashPassword(newPassword);
  await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u.id));
  await db
    .update(schema.passwordResets)
    .set({ consumedAt: now })
    .where(eq(schema.passwordResets.id, pr.id));
  return { userId: u.id };
}

/**
 * Cambio de contraseña autenticado (requiere la actual). Devuelve true si OK,
 * false si la contraseña actual no coincide.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const hash = rows[0]?.passwordHash;
  if (!hash) return false;
  if (!(await verifyPassword(currentPassword, hash))) return false;
  await db.update(schema.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(schema.users.id, userId));
  return true;
}

/** Login por email+password. Devuelve user.id o null (credenciales inválidas). */
export async function login(email: string, password: string): Promise<{ userId: string } | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      passwordHash: schema.users.passwordHash,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);

  const u = rows[0];
  // Comparación SIEMPRE contra un hash (real o dummy) para no filtrar por timing
  // si el email existe o no (mitiga el oráculo de enumeración).
  // nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash -- hash dummy de relleno (ceros), no es un secreto real
  const dummy = "$2b$12$0000000000000000000000000000000000000000000000000000z";
  const ok = await verifyPassword(password, u?.passwordHash ?? dummy);
  if (!u || u.status !== "active" || !u.passwordHash || !ok) return null;

  await db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, u.id));
  return { userId: u.id };
}
