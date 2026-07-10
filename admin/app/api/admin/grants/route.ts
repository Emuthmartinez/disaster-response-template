import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const userId = new URL(request.url).searchParams.get("userId");
  const result = await client.get<{ items: unknown[] }>(
    `/api/public/grants${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`,
  );
  return result.ok ? json(result.value.items, 200) : mapApiError(result.error);
}

export async function POST(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const result = await client.post<{ item: unknown }>("/api/public/grants", await request.json());
  return result.ok ? json(result.value.item, 201) : mapApiError(result.error);
}
