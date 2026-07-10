/**
 * BFF /api/admin/audit — proxy a /api/public/audit (audit:read).
 *
 * Reenvía filtros (actorUserId, targetType, targetId, before, limit) como
 * query params al backend. El backend gatea con requireCapability("audit:read");
 * aquí solo propagamos el resultado.
 */
import { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["actorUserId", "targetType", "targetId", "before", "limit"]) {
    const v = searchParams.get(key);
    if (v !== null) qs.set(key, v);
  }

  const path = `/api/public/audit${qs.toString() ? `?${qs.toString()}` : ""}`;
  const result = await client.get<{ items: unknown[] }>(path);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value.items, 200);
}
