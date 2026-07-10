/**
 * BFF /api/admin/api-keys — GET (lista mis llaves) y POST (crea) proxy a
 * /api/public/api-keys. Reenvía la sesión vía Bearer (cookie httpOnly → backend).
 * El backend gatea por apikey:manage; aquí solo propagamos. La llave CRUDA solo
 * aparece en la respuesta del POST (una vez) y nunca se persiste en el panel.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const result = await client.get<{ items: unknown[] }>("/api/public/api-keys");
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

  // El backend responde { apiKey, key } — `key` es la llave cruda (única vez).
  const result = await client.post<{ apiKey: unknown; key: string }>(
    "/api/public/api-keys",
    body,
  );
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 201);
}
