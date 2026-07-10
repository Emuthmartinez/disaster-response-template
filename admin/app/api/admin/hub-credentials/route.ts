/**
 * BFF /api/admin/hub-credentials — GET (lista) y POST (emite) proxy a
 * /api/public/hub-credentials. Reenvía la sesión vía Bearer. El backend gatea por
 * mirror:manage (solo super admin). La respuesta del POST incluye la conexión +
 * password UNA sola vez; nunca se persiste en el panel.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const result = await client.get<{ items: unknown[] }>("/api/public/hub-credentials");
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

  // Devuelve { credential, connection, psql } — connection.password es única vez.
  const result = await client.post<unknown>("/api/public/hub-credentials", body);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 201);
}
