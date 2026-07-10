/**
 * BFF auth login — RBAC JWT con cookie httpOnly.
 *
 * Recibe { email, password } del navegador, lo reenvía al backend
 * POST /api/public/auth/login. El backend devuelve { ok, token }; el BFF guarda
 * ese JWT en su PROPIA cookie httpOnly (admin_session) y responde { ok:true }.
 * El navegador nunca ve el token.
 *
 * - 200 { ok:true }   — credenciales válidas; cookie de sesión emitida
 * - 401               — credenciales inválidas
 * - 400               — body inválido
 * - 502               — backend inalcanzable / error inesperado
 */

import { NextResponse } from "next/server";
import { createHttpClient } from "../../../../src/shared/http/http-client";
import { getApiBaseUrl } from "../../../../src/config/api-registry";
import { setSessionCookie } from "../../../../src/shared/auth/session-cookie";
import { BFF_CACHE_HEADERS } from "../../_shared/bff-cache";

export const dynamic = "force-dynamic";

// TTL de la cookie del BFF. Espeja JWT_TTL_SECONDS del backend (default 12h).
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43200);

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: BFF_CACHE_HEADERS },
    );
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const email = obj.email;
  const password = obj.password;
  if (
    typeof email !== "string" ||
    email.length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400, headers: BFF_CACHE_HEADERS },
    );
  }

  const client = createHttpClient({ baseUrl: getApiBaseUrl("emergency") });
  const result = await client.post<{ ok: boolean; token: string }>("/api/public/auth/login", {
    email,
    password,
  });

  if (!result.ok) {
    if (result.error.kind === "auth") {
      return NextResponse.json(
        { error: "Credenciales inválidas." },
        { status: 401, headers: BFF_CACHE_HEADERS },
      );
    }
    // Propaga el rate-limit del backend (anti-brute-force): el usuario debe
    // saber que espere, y un atacante recibe la señal de backoff.
    if (result.error.kind === "http" && result.error.status === 429) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
        { status: 429, headers: BFF_CACHE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "El servicio de autenticación no respondió correctamente." },
      { status: 502, headers: BFF_CACHE_HEADERS },
    );
  }

  const token = result.value.token;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json(
      { error: "El servicio de autenticación devolvió una respuesta inválida." },
      { status: 502, headers: BFF_CACHE_HEADERS },
    );
  }

  const res = NextResponse.json({ ok: true }, { status: 200, headers: BFF_CACHE_HEADERS });
  setSessionCookie(res, token, SESSION_MAX_AGE);
  return res;
}
