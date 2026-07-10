/**
 * BFF /api/admin/users — GET (lista) proxy a /api/public/users (user:read).
 * El backend gatea; aquí solo propagamos.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const result = await client.get<{ items: unknown[] }>("/api/public/users");
  if (!result.ok) return mapApiError(result.error);
  return json(result.value.items, 200);
}
