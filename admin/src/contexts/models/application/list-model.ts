/**
 * Use case: listar las filas de un modelo. Delegación pura al gateway (YAGNI).
 */
import type { Result } from "../../../shared/result";
import type { ModelsGateway, ModelRow } from "./models-gateway";

export function listModel(
  gateway: ModelsGateway,
  path: string,
  fields?: readonly string[],
): Promise<Result<ModelRow[]>> {
  return gateway.list(path, fields);
}
