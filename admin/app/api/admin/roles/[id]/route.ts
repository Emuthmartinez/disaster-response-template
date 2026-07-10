/**
 * BFF /api/admin/roles/[id] — PATCH (edita) y DELETE (elimina) proxy a
 * /api/public/roles/:id. El backend gatea role:edit / role:delete y protege los
 * roles isSystem (403); aquí solo propagamos el resultado.
 */
import type { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../../_shared/proxy";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const result = await client.patch<{ item: unknown }>(`/api/public/roles/${id}`, body);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value.item, 200);
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const { id } = await ctx.params;

  const result = await client.delete<{ ok: boolean }>(`/api/public/roles/${id}`);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 200);
}
