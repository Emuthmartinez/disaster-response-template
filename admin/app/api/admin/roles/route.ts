/**
 * BFF /api/admin/roles — GET (lista) y POST (crea) proxy a /api/public/roles.
 *
 * Reenvía la sesión vía Bearer (cookie httpOnly → backend). El backend gatea por
 * role:read / role:create; aquí solo propagamos el resultado.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const result = await client.get<{ items: unknown[] }>("/api/public/roles");
  if (!result.ok) return mapApiError(result.error);
  return json(result.value.items, 200);
}

export async function POST(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const result = await client.post<{ item: unknown }>("/api/public/roles", body);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value.item, 201);
}
