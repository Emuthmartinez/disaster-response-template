/**
 * BFF /api/admin/hub-credentials/[id] — DELETE (revoca) proxy a
 * /api/public/hub-credentials/:id. El backend hace DROP ROLE + cierra la IP en el
 * firewall + soft-delete. Gateado por mirror:manage (super admin).
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

  const result = await client.delete<{ ok: boolean }>(`/api/public/hub-credentials/${id}`);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 200);
}
