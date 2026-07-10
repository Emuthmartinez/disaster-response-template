/**
 * BFF /api/admin/invite — proxy a POST /api/public/auth/invite (user:invite).
 *
 * Crea una invitación (email + rol opcional). El backend envía el email o, en
 * dev sin SMTP, devuelve el link en la respuesta — que propagamos para que el
 * admin pueda copiarlo.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const email = obj.email;
  if (typeof email !== "string" || email.length === 0) {
    return json({ error: "El email es obligatorio." }, 400);
  }
  const payload: Record<string, unknown> = { email };
  if (typeof obj.roleId === "string" && obj.roleId.length > 0) payload.roleId = obj.roleId;

  // El backend puede devolver { ok, inviteUrl? } (dev) — lo pasamos tal cual.
  const result = await client.post<Record<string, unknown>>("/api/public/auth/invite", payload);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 201);
}
