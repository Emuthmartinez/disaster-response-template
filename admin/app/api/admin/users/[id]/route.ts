/**
 * BFF /api/admin/users/[id] — PATCH (rol/estado/nombre) y DELETE (suspender).
 *
 * DELETE es SOFT en el backend (status=disabled, nunca borra la fila). PATCH
 * sirve para reactivar (status:active), suspender (status:disabled) o cambiar
 * rol. El backend gatea user:edit / user:delete y bloquea auto-lockout.
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

  const result = await client.patch<{ item: unknown }>(`/api/public/users/${id}`, body);
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

  const result = await client.delete<{ ok: boolean }>(`/api/public/users/${id}`);
  if (!result.ok) return mapApiError(result.error);
  return json(result.value, 200);
}
