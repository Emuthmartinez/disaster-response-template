/**
 * BFF /api/auth/logout — limpia la cookie de sesión local y avisa al backend.
 *
 * Best-effort: aunque el backend no responda, la cookie local se borra (la
 * sesión del navegador termina). El backend logout solo limpia su cookie, que
 * aquí no usamos, pero lo llamamos para auditoría/consistencia.
 *
 * - 200 { ok:true } — siempre (logout es idempotente)
 */

import { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { clearSessionCookie } from "../../../../src/shared/auth/session-cookie";
import { BFF_CACHE_HEADERS } from "../../_shared/bff-cache";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (client) {
    // Best-effort; ignoramos el resultado (la cookie local manda).
    await client.post("/api/public/auth/logout", {});
  }
  const res = NextResponse.json({ ok: true }, { status: 200, headers: BFF_CACHE_HEADERS });
  clearSessionCookie(res);
  return res;
}
