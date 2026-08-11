import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const result = await client.get<unknown>("/api/public/hospital-supplies");
  return result.ok ? json(result.value, 200) : mapApiError(result.error);
}
