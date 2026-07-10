/**
 * Port: ModelsGateway (read-only).
 *
 * La aplicación depende de esta abstracción, no del adaptador HTTP concreto.
 * Para F1 (listados read-only genéricos) una fila es un objeto plano; cada
 * vista renderiza solo las columnas declaradas en el model-registry. Cuando un
 * modelo requiera dominio propio, se le da su bounded-context dedicado.
 */
import type { Result } from "../../../shared/result";

export type ModelRow = Record<string, unknown>;

export interface ModelsGateway {
  list(path: string, fields?: readonly string[]): Promise<Result<ModelRow[]>>;
  create(path: string, input: unknown): Promise<Result<ModelRow>>;
  update(path: string, id: string, input: unknown): Promise<Result<ModelRow>>;
  remove(path: string, id: string): Promise<Result<{ ok: boolean }>>;
}
