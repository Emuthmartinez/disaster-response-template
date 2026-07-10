/**
 * BFF route: GET /api/models/[path]
 *
 * Composition root genérico para los 7 modelos read-only. Valida el path contra
 * el model-registry, exige sesión (Bearer desde la cookie httpOnly) y devuelve
 * las filas. La autorización REAL la hace el backend (requireCapability
 * <model>:read); aquí un 403 del backend se propaga como 403.
 *
 * - 200 ModelRow[]  — ok
 * - 401             — sin sesión
 * - 403             — sesión sin la capacidad <model>:read
 * - 404             — path desconocido
 * - 502             — backend inalcanzable
 */
import { NextResponse } from "next/server";
import { createAuthedEmergencyClient } from "../../../../src/shared/http/authed-fetch";
import { getModel } from "../../../../src/contexts/models/model-registry";
import { createHttpModelsGateway } from "../../../../src/contexts/models/infrastructure/http-models-gateway";
import { listModel } from "../../../../src/contexts/models/application/list-model";
import { BFF_CACHE_HEADERS } from "../../_shared/bff-cache";
import { json, mapApiError, unauthorized } from "../../_shared/proxy";

export const dynamic = "force-dynamic";

function displayedRow(row: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path: string }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;

  const model = getModel(path);
  if (!model) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: BFF_CACHE_HEADERS });
  }

  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();

  const fields = ["id", ...model.columns.map((column) => column.key)];
  const result = await listModel(createHttpModelsGateway(client), path, fields);
  if (result.ok) {
    return NextResponse.json(result.value, { status: 200, headers: BFF_CACHE_HEADERS });
  }

  return mapApiError(result.error);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ path: string }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const model = getModel(path);
  if (!model?.createFields) return json({ error: "Not found" }, 404);
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const result = await createHttpModelsGateway(client).create(path, await request.json());
  const fields = ["id", ...model.columns.map((column) => column.key)];
  return result.ok ? json(displayedRow(result.value, fields), 201) : mapApiError(result.error);
}
