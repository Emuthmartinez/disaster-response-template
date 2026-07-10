/**
 * Service del chat ciudadano. La LÓGICA y las consultas viven aquí (no en el
 * route). Porta la implementación real de lib/chat.ts del app Next previo
 * (listMessages / addMessage / removeMessage), preservando el comportamiento
 * EXACTO, y devolviendo SIEMPRE DTOs por allowlist (toChatDTO) — nunca la fila
 * de DB cruda.
 *
 * Diferencia vs. lib/chat.ts: el backend SIEMPRE tiene DB (getDb() obligatorio),
 * así que se omite el fallback en memoria. `persistent` es siempre true.
 */
import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { chatMessages } = schema;

// --- Roles del chat (espejo de lib/chat-types.ts) ---
export type ChatRole =
  | "rescuer"
  | "medic"
  | "volunteer"
  | "coordinator"
  | "ngo"
  | "citizen";

const CHAT_ROLE_KEYS: ChatRole[] = [
  "rescuer",
  "medic",
  "volunteer",
  "coordinator",
  "ngo",
  "citizen",
];

export function isValidChatRole(role: string): role is ChatRole {
  return (CHAT_ROLE_KEYS as string[]).includes(role);
}

// --- Constantes de validación (espejan lib/chat.ts) ---
export const MAX_NAME = 40;
export const MAX_TEXT = 500;
const MAX_REPLY_PREVIEW = 120;
const FETCH_LIMIT = 200;

// DTO público (allowlist explícita — NUNCA exponer columnas internas).
export interface ChatDTO {
  id: string;
  name: string;
  role: ChatRole;
  text: string;
  replyTo: string | null;
  replyPreview: string | null;
  threadRootId: string;
  threadBumpedAt: number;
  createdAt: number;
}

type ChatRow = typeof chatMessages.$inferSelect;

/** Allowlist de salida: fila DB -> DTO público. Idéntico a rowToMessage de lib/chat.ts. */
export function toChatDTO(row: ChatRow): ChatDTO {
  return {
    id: row.id,
    name: row.name,
    role: isValidChatRole(row.role) ? row.role : "citizen",
    text: row.text,
    replyTo: row.replyTo ?? null,
    replyPreview: row.replyPreview ?? null,
    threadRootId: row.threadRootId ?? row.id,
    threadBumpedAt: Number(row.threadBumpedAt),
    createdAt: Number(row.createdAt),
  };
}

function sanitizeName(name: string | undefined | null): string {
  const trimmed = (name ?? "").trim().slice(0, MAX_NAME);
  return trimmed || "Anónimo";
}

function normalizeRole(role: string | undefined | null): ChatRole {
  return isValidChatRole(role ?? "") ? (role as ChatRole) : "citizen";
}

function buildReplyPreview(name: string, text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const preview =
    clean.length > MAX_REPLY_PREVIEW
      ? clean.slice(0, MAX_REPLY_PREVIEW - 1) + "…"
      : clean;
  return `${sanitizeName(name)}: ${preview}`;
}

export interface ListMessagesOptions {
  /** Filtra mensajes por rol. Si no se indica, devuelve todos. */
  role?: ChatRole;
}

/**
 * Devuelve los mensajes agrupados por hilo y ordenados por la última actividad
 * de cada hilo (como WhatsApp). Dentro de un hilo los mensajes mantienen orden
 * cronológico. Porta listMessages de lib/chat.ts (rama con DB).
 */
export async function listMessages(
  options: ListMessagesOptions = {},
): Promise<ChatDTO[]> {
  const db = await getDb();
  const roleFilter = options.role;

  let rows: ChatRow[];
  if (roleFilter) {
    // Cuando filtramos por rol, solo mostramos mensajes de ese rol y sus
    // respuestas directas, manteniendo el orden por hilo.
    rows = (await db
      .select()
      .from(chatMessages)
      .where(
        or(
          eq(chatMessages.role, roleFilter),
          inArray(
            chatMessages.threadRootId,
            db
              .select({ id: chatMessages.id })
              .from(chatMessages)
              .where(eq(chatMessages.role, roleFilter)),
          ),
        ),
      )
      .orderBy(desc(chatMessages.threadBumpedAt), asc(chatMessages.createdAt))
      .limit(FETCH_LIMIT)) as ChatRow[];
  } else {
    rows = (await db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.threadBumpedAt), asc(chatMessages.createdAt))
      .limit(FETCH_LIMIT)) as ChatRow[];
  }
  return rows.map(toChatDTO);
}

export interface AddMessageInput {
  name?: string;
  text: string;
  role?: string;
  replyTo?: string | null;
}

/** Porta addMessage de lib/chat.ts (rama con DB): insert + bump de hilo atómico. */
export async function addMessage(input: AddMessageInput): Promise<ChatDTO> {
  const db = await getDb();
  const now = Date.now();
  const role = normalizeRole(input.role);
  const replyToId = input.replyTo ?? null;

  let threadRootId: string;
  let replyPreview: string | null = null;

  if (replyToId) {
    const parent = await getParentFromDb(replyToId);
    if (parent) {
      threadRootId = parent.threadRootId ?? parent.id;
      replyPreview = buildReplyPreview(parent.name, parent.text);
    } else {
      threadRootId = replyToId;
    }
  } else {
    threadRootId = replyToId ?? "";
  }

  const id = crypto.randomUUID();
  const name = sanitizeName(input.name);
  const text = input.text.trim().slice(0, MAX_TEXT);

  // Si es mensaje raíz, su propio id es el root.
  if (!replyToId) {
    threadRootId = id;
  }

  // INSERT del mensaje + "bump" del hilo (sube en orden tipo WhatsApp) en una
  // sola sentencia atómica. El CTE no ve su propio INSERT, pero el mensaje nuevo
  // ya entra con thread_bumped_at = now, así que el estado final es el mismo y
  // evitamos un roundtrip y el riesgo de desync entre ambas queries.
  await db.execute(sql`
    WITH ins AS (
      INSERT INTO ${chatMessages}
        (id, name, role, text, reply_to, reply_preview,
         thread_root_id, thread_bumped_at, created_at)
      VALUES (
        ${id}, ${name}, ${role}, ${text},
        ${replyToId}, ${replyPreview},
        ${threadRootId}, ${now}, ${now}
      )
    )
    UPDATE ${chatMessages}
    SET thread_bumped_at = ${now}
    WHERE thread_root_id = ${threadRootId}
  `);

  return {
    id,
    name,
    role,
    text,
    replyTo: replyToId,
    replyPreview,
    threadRootId,
    threadBumpedAt: now,
    createdAt: now,
  };
}

/** Devuelve un mensaje por id como DTO (allowlist), o null si no existe. */
export async function getMessageById(id: string): Promise<ChatDTO | null> {
  const db = await getDb();
  const rows = (await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id))
    .limit(1)) as ChatRow[];
  const first = rows[0];
  return first ? toChatDTO(first) : null;
}

async function getParentFromDb(id: string): Promise<ChatDTO | null> {
  const db = await getDb();
  const rows = (await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id))
    .limit(1)) as ChatRow[];
  const first = rows[0];
  return first ? toChatDTO(first) : null;
}

/** Porta removeMessage de lib/chat.ts (rama con DB): DELETE ... RETURNING id. */
export async function removeMessage(id: string): Promise<boolean> {
  const db = await getDb();
  // El builder de delete().returning() no resuelve sobre el tipo unión de
  // drivers (neon-http | node-postgres); usamos el escape `sql` preservando la
  // semántica exacta del DELETE ... RETURNING id.
  const result = await db.execute(
    sql`DELETE FROM ${chatMessages} WHERE ${chatMessages.id} = ${id} RETURNING ${chatMessages.id}`,
  );
  const rows = (Array.isArray(result) ? result : result.rows) as unknown[];
  return rows.length > 0;
}
