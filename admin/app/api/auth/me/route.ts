/**
 * BFF /api/auth/me — proxy a GET /api/public/auth/me del backend.
 *
 * Reenvía la sesión vía Bearer (leído de la cookie httpOnly). Expone al cliente
 * el usuario + sus capacidades efectivas para el gate capability-aware. El JWT
 * nunca sale al navegador.
 *
 * - 200 { user, capabilities }  — autenticado
 * - 401                          — sin sesión / sesión inválida
 * - 502                          — backend inalcanzable
 */

import { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { BFF_CACHE_HEADERS } from "../../_shared/bff-cache";

export const dynamic = "force-dynamic";

export type MeResponse = {
  user: { id: string; email: string; roleId: string | null; orgId: string | null; isAdmin: boolean };
  capabilities: string[];
};

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: BFF_CACHE_HEADERS });
  }

  const result = await client.get<MeResponse>("/api/public/auth/me");
  if (!result.ok) {
    if (result.error.kind === "auth") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: BFF_CACHE_HEADERS });
    }
    return NextResponse.json(
      { error: "Upstream service error" },
      { status: 502, headers: BFF_CACHE_HEADERS },
    );
  }

  return NextResponse.json(result.value, { status: 200, headers: BFF_CACHE_HEADERS });
}
