import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const idempotencyKey = request.headers.get("idempotency-key");
  const result = await client.post<unknown>(
    "/api/public/patient-imports",
    await request.json(),
    idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined,
  );
  return result.ok ? json(result.value, 202) : mapApiError(result.error);
}
