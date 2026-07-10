/**
 * Sesión del dashboard admin — cookie httpOnly SERVER-SIDE.
 *
 * El navegador NUNCA ve el JWT: el BFF lo guarda en una cookie httpOnly propia
 * (`admin_session`), host-only sobre admin.* (Secure + SameSite=Lax). El estado
 * de sesión en el cliente se deriva de GET /api/auth/me, no de leer la cookie.
 *
 * Best practice (cookie de auth en subdominio standalone): HttpOnly + Secure +
 * SameSite=Lax, host-only (sin Domain de dominio padre) → máxima aislación, sin
 * SSO accidental con el sitio público.
 */
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "admin_session";

// Secure por defecto; solo se relaja con COOKIE_SECURE="false" (dev local http,
// donde el browser descarta cookies Secure). Espeja directamente el flag del
// backend en vez de inferir por NODE_ENV: así un staging sobre HTTPS con
// NODE_ENV!="production" igual emite la cookie como Secure.
const isSecure = process.env.COOKIE_SECURE !== "false";

/** Lee el JWT de la cookie de sesión del request (BFF). null si no hay. */
export function readSessionToken(request: NextRequest | Request): string | null {
  // NextRequest tiene .cookies; Request crudo no — caer al header Cookie.
  const fromNext = (request as NextRequest).cookies?.get?.(SESSION_COOKIE)?.value;
  if (fromNext) return fromNext;
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Escribe la cookie de sesión httpOnly en la respuesta del BFF. */
export function setSessionCookie(res: NextResponse, token: string, maxAgeSeconds: number): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/** Limpia la cookie de sesión (logout). */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
