/**
 * BFF público /api/invitations/[token] — valida una invitación.
 *
 * Proxy a GET /api/public/auth/invite/:token. NO requiere sesión (el invitado
 * aún no tiene cuenta). Devuelve { email, roleId, expiresAt } o 404.
 */
import type { NextResponse } from "next/server";
import { createHttpClient } from "../../../../src/shared/http/http-client";
import { getApiBaseUrl } from "../../../../src/config/api-registry";
import { json, mapApiError } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await ctx.params;
  const client = createHttpClient({ baseUrl: getApiBaseUrl("emergency") });
  const result = await client.get<{ email: string; roleId: string | null; expiresAt: number }>(
    `/api/public/auth/invite/${encodeURIComponent(token)}`,
  );
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 200);
}
