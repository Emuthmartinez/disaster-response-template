/**
 * BFF público /api/invitations/accept — acepta una invitación.
 *
 * Proxy a POST /api/public/auth/accept { token, password, name? }. El backend
 * fija la contraseña, activa la cuenta y devuelve { ok, token }. El BFF emite su
 * cookie httpOnly de sesión (igual que el login) → el usuario queda logueado.
 */
import type { NextResponse } from "next/server";
import { createHttpClient } from "../../../../src/shared/http/http-client";
import { getApiBaseUrl } from "../../../../src/config/api-registry";
import { setSessionCookie } from "../../../../src/shared/auth/session-cookie";
import { json, mapApiError } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43200);

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const token = obj.token;
  const password = obj.password;
  if (typeof token !== "string" || token.length === 0) return json({ error: "Token requerido." }, 400);
  if (typeof password !== "string" || password.length < 8) {
    return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
  }
  const payload: Record<string, unknown> = { token, password };
  if (typeof obj.name === "string" && obj.name.length > 0) payload.name = obj.name;

  const client = createHttpClient({ baseUrl: getApiBaseUrl("emergency") });
  const result = await client.post<{ ok: boolean; token: string }>(
    "/api/public/auth/accept",
    payload,
  );
  if (!result.ok) return mapApiError(result.error);

  const jwt = result.value.token;
  if (typeof jwt !== "string" || jwt.length === 0) {
    return json({ error: "Respuesta inválida del servidor." }, 502);
  }

  const res = json({ ok: true }, 200);
  setSessionCookie(res, jwt, SESSION_MAX_AGE);
  return res;
}
