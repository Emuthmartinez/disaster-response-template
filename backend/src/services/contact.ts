/**
 * Service de la bandeja de contacto. Port directo de lib/contact-inbox.ts
 * (rama hasDbEnv): inserta el mensaje persistiendo el HASH de IP (nunca la IP
 * cruda — contexto humanitario).
 *
 * La validación de longitudes/formato vive en el route (zod). Aquí solo persiste.
 * Devuelve solo el id (el route arma la respuesta pública); NUNCA expone ip_hash.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { contactMessages } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mensaje expuesto al admin. Allowlist: NUNCA incluye ip_hash. */
export interface ContactMessageDTO {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export interface ContactStats {
  total: number;
  unread: number;
  last24h: number;
}

export async function createContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ipHash?: string | null;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(contactMessages).values({
    id,
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    read: false,
    ipHash: input.ipHash ?? null,
    createdAt: Date.now(),
  });
  return { id };
}

/** Lista de mensajes para el panel admin (DTO allowlist, sin ip_hash). */
export async function listContactMessages(): Promise<ContactMessageDTO[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: contactMessages.id,
      name: contactMessages.name,
      email: contactMessages.email,
      subject: contactMessages.subject,
      message: contactMessages.message,
      read: contactMessages.read,
      createdAt: contactMessages.createdAt,
    })
    .from(contactMessages)
    .orderBy(desc(contactMessages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    subject: r.subject,
    message: r.message,
    read: Boolean(r.read),
    createdAt: Number(r.createdAt),
  }));
}

export async function getContactStats(): Promise<ContactStats> {
  const db = await getDb();
  const cutoff = Date.now() - DAY_MS;
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      unread: sql<number>`COUNT(*) FILTER (WHERE ${contactMessages.read} = false)::int`,
      last24h: sql<number>`COUNT(*) FILTER (WHERE ${contactMessages.createdAt} >= ${cutoff})::int`,
    })
    .from(contactMessages);
  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    unread: Number(row?.unread ?? 0),
    last24h: Number(row?.last24h ?? 0),
  };
}

export async function markContactMessageRead(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    sql`UPDATE ${contactMessages} SET ${contactMessages.read} = true WHERE ${contactMessages.id} = ${id} RETURNING ${contactMessages.id}`,
  );
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as unknown[];
  return rows.length > 0;
}

/** Un mensaje por id como DTO (allowlist, sin ip_hash), o null si no existe. */
export async function getContactMessageById(
  id: string,
): Promise<ContactMessageDTO | null> {
  const db = await getDb();
  const rows = await db
    .select({
      id: contactMessages.id,
      name: contactMessages.name,
      email: contactMessages.email,
      subject: contactMessages.subject,
      message: contactMessages.message,
      read: contactMessages.read,
      createdAt: contactMessages.createdAt,
    })
    .from(contactMessages)
    .where(eq(contactMessages.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    subject: r.subject,
    message: r.message,
    read: Boolean(r.read),
    createdAt: Number(r.createdAt),
  };
}

/**
 * Marca un mensaje como leído y devuelve el DTO actualizado (o null si no
 * existe). Único campo editable de la bandeja: `read`. Reúsa el UPDATE atómico
 * y devuelve el DTO allowlist para encajar con el verbo `update` del CRUD.
 */
export async function setContactMessageRead(
  id: string,
): Promise<ContactMessageDTO | null> {
  const ok = await markContactMessageRead(id);
  if (!ok) return null;
  return getContactMessageById(id);
}
