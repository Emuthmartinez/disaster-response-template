/**
 * Service de API keys self-service. La lógica y las consultas Drizzle viven aquí.
 *
 * Modelo de seguridad (espeja hospital_poc_assignments + invitations):
 *  - La llave cruda se genera una vez, se devuelve UNA sola vez y NUNCA se guarda.
 *  - En DB solo va el hash SHA-256 + un `prefix` no secreto para identificarla.
 *  - Lookup en auth = O(1) por hash (índice único). Sin sal: la llave ya es
 *    aleatoria de alta entropía, bcrypt sería innecesario y rompería el lookup.
 *  - `scopes` acota la llave a un SUBCONJUNTO de las capacidades del dueño. El
 *    permiso efectivo se calcula en cada request (scopes ∩ caps vivas) — ver
 *    auth/resolve.ts. Aquí solo validamos que al crear no se pidan scopes que el
 *    usuario no tenga.
 *  - Revocación = soft delete (revokedAt), nunca borrado físico.
 */
import { randomBytes, createHash, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { CAPABILITY_KEYS } from "@/auth/capabilities";
import { effectiveCapabilities, type AuthUser } from "@/auth/resolve";

const { apiKeys } = schema;

// Prefijo de marca (identifica la llave en logs / leak-scanners) + cuerpo random.
const KEY_PREFIX = "mer_sk_";
// Longitud del prefijo no secreto que mostramos en la UI (marca + unos chars).
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 6;

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Genera una llave nueva: (cruda, prefijo visible, hash). La cruda no se guarda. */
function generateKey(): { raw: string; prefix: string; keyHash: string } {
  // 32 bytes → 43 chars base64url; alta entropía.
  const raw = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { raw, prefix: raw.slice(0, DISPLAY_PREFIX_LEN), keyHash: hashKey(raw) };
}

/** DTO público de una llave — NUNCA incluye la cruda ni el hash. */
export interface ApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
}

function toDTO(row: typeof apiKeys.$inferSelect): ApiKeyDTO {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: (row.scopes as string[]) ?? [],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: number | null;
}

export class ScopeError extends Error {}

/**
 * Crea una llave para `user`. Valida que cada scope sea una capability real Y que
 * el usuario la tenga (no puedes conceder a una llave algo que no posees). El
 * admin semilla puede pedir cualquier capability del catálogo. Devuelve el DTO +
 * la llave CRUDA (única vez que existe).
 */
export async function createApiKey(
  user: AuthUser,
  input: CreateApiKeyInput,
): Promise<{ apiKey: ApiKeyDTO; rawKey: string }> {
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0) {
    throw new ScopeError("Elige al menos una capacidad (scope) para la llave.");
  }
  // 1) Todas deben existir en el catálogo.
  const unknown = scopes.filter((s) => !CAPABILITY_KEYS.has(s));
  if (unknown.length > 0) {
    throw new ScopeError(`Scopes desconocidos: ${unknown.join(", ")}`);
  }
  // 2) El usuario debe poseer cada scope (el admin semilla posee todo: "*").
  const own = await effectiveCapabilities(user);
  if (!own.includes("*")) {
    const ownSet = new Set(own);
    const missing = scopes.filter((s) => !ownSet.has(s));
    if (missing.length > 0) {
      throw new ScopeError(
        `No puedes conceder capacidades que no tienes: ${missing.join(", ")}`,
      );
    }
  }

  const { raw, prefix, keyHash } = generateKey();
  const now = Date.now();
  const row = {
    id: randomUUID(),
    userId: user.id,
    name: input.name.trim(),
    keyHash,
    prefix,
    scopes,
    createdAt: now,
    lastUsedAt: null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    revokedBy: null,
  };
  await getDb().insert(apiKeys).values(row);
  return { apiKey: toDTO(row as typeof apiKeys.$inferSelect), rawKey: raw };
}

/** Lista las llaves de UN usuario (incluye revocadas, para que vea el historial). */
export async function listApiKeysForUser(userId: string): Promise<ApiKeyDTO[]> {
  const rows = await getDb()
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(toDTO);
}

/** Una llave por id (para checar dueño antes de revocar). null si no existe. */
export async function getApiKeyById(id: string): Promise<typeof apiKeys.$inferSelect | null> {
  const rows = await getDb().select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Revoca (soft delete) una llave. Idempotente: si ya estaba revocada, no la pisa. */
export async function revokeApiKey(id: string, revokedBy: string): Promise<void> {
  const now = Date.now();
  await getDb()
    .update(apiKeys)
    .set({ revokedAt: now, revokedBy })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
}

/** Llave + dueño resueltos desde una llave cruda, para el middleware de auth. */
export interface ResolvedApiKey {
  id: string;
  userId: string;
  scopes: string[];
}

/**
 * Resuelve una llave cruda para autenticación: hash → lookup O(1) → valida que
 * esté activa (no revocada, no expirada). Devuelve null si es inválida. Hace bump
 * de lastUsedAt fire-and-forget (no bloquea ni rompe el request si falla).
 */
export async function resolveApiKey(raw: string): Promise<ResolvedApiKey | null> {
  if (!raw.startsWith(KEY_PREFIX)) return null;
  const rows = await getDb()
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(raw)))
    .limit(1);

  const k = rows[0];
  if (!k) return null;
  if (k.revokedAt !== null) return null;
  if (k.expiresAt !== null && k.expiresAt <= Date.now()) return null;

  // Bump lastUsedAt sin bloquear (errores a stderr, jamás tumban la auth).
  void getDb()
    .update(apiKeys)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiKeys.id, k.id))
    .catch((err) => console.error("apiKey lastUsedAt bump failed:", err));

  return { id: k.id, userId: k.userId, scopes: (k.scopes as string[]) ?? [] };
}

/** True si la llave cruda tiene el formato de una API key (no un JWT). */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}
