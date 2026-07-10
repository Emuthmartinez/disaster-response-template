import type { NextResponse } from "next/server";
import { getModel } from "../../../../../src/contexts/models/model-registry";
import { createHttpModelsGateway } from "../../../../../src/contexts/models/infrastructure/http-models-gateway";
import { createAuthedEmergencyClient } from "../../../../../src/shared/http/authed-fetch";
import { json, mapApiError, unauthorized } from "../../../_shared/proxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string; id: string }> };

function displayedRow(row: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  const { path, id } = await context.params;
  const model = getModel(path);
  if (!model?.editFields) return json({ error: "Not found" }, 404);
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const result = await createHttpModelsGateway(client).update(path, id, await request.json());
  const fields = ["id", ...model.columns.map((column) => column.key)];
  return result.ok ? json(displayedRow(result.value, fields), 200) : mapApiError(result.error);
}

export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  const { path, id } = await context.params;
  const model = getModel(path);
  if (!model?.canDelete) return json({ error: "Not found" }, 404);
  const client = createAuthedEmergencyClient(request);
  if (!client) return unauthorized();
  const result = await createHttpModelsGateway(client).remove(path, id);
  return result.ok ? json(result.value, 200) : mapApiError(result.error);
}
