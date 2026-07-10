/**
 * BFF /api/admin/api-keys/[id] — DELETE (revoca) proxy a /api/public/api-keys/:id.
 * El backend hace soft-delete (revokedAt) y gatea: tu propia llave siempre; ajena
 * solo el admin semilla. Reenvía la sesión vía Bearer.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const { id } = await ctx.params;

  const result = await client.delete<{ ok: boolean }>(`/api/public/api-keys/${id}`);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 200);
}
