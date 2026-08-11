import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../../../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; needId: string }> },
): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const { id, needId } = await context.params;
  const result = await client.patch<unknown>(
    `/api/public/hospital-supplies/${encodeURIComponent(id)}/needs/${encodeURIComponent(needId)}`,
    await request.json(),
  );
  return result.ok ? json(result.value, 200) : mapApiError(result.error);
}
