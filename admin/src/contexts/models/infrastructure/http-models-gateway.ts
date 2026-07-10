/**
 * Infrastructure adapter: ModelsGateway vía HTTP autenticado.
 *
 * Llama GET /api/public/<path> en el backend (cliente con Bearer ya inyectado
 * por el BFF) y extrae el array `items` (envelope uniforme de crud-factory).
 * Todo error vuelve como Result — sin throw en esta capa.
 */
import { err, ok } from "../../../shared/result";
import type { HttpClient } from "../../../shared/http/http-client";
import type { ModelsGateway, ModelRow } from "../application/models-gateway";
import type { Result } from "../../../shared/result";

type ListEnvelope = { items: unknown[] };
type ItemEnvelope = { item: ModelRow };

function pickFields(row: ModelRow, fields?: readonly string[]): ModelRow {
  if (!fields) return row;
  return Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
}

export function createHttpModelsGateway(client: HttpClient): ModelsGateway {
  return {
    async list(path: string, fields?: readonly string[]): Promise<Result<ModelRow[]>> {
      const result = await client.get<ListEnvelope>(`/api/public/${path}`);
      if (!result.ok) return result;

      const items = result.value?.items;
      if (!Array.isArray(items)) {
        return err({ kind: "parse", message: `respuesta de ${path} sin array "items"` });
      }
      // Read-only: cada item se trata como fila plana; la tabla filtra columnas.
      const rows = items.filter(
        (it): it is ModelRow => typeof it === "object" && it !== null,
      );
      return ok(rows.map((row) => pickFields(row, fields)));
    },
    async create(path: string, input: unknown): Promise<Result<ModelRow>> {
      const result = await client.post<ItemEnvelope>(`/api/public/${path}`, input);
      return result.ok ? ok(result.value.item) : result;
    },
    async update(path: string, id: string, input: unknown): Promise<Result<ModelRow>> {
      const result = await client.patch<ItemEnvelope>(
        `/api/public/${path}/${encodeURIComponent(id)}`,
        input,
      );
      return result.ok ? ok(result.value.item) : result;
    },
    remove(path: string, id: string): Promise<Result<{ ok: boolean }>> {
      return client.delete(`/api/public/${path}/${encodeURIComponent(id)}`);
    },
  };
}
