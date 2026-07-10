/**
 * Domain-agnostic Result type for explicit error handling.
 * HttpClient and API layers return Result instead of throwing.
 */

export type ApiError = {
  kind: "http" | "network" | "parse" | "auth";
  status?: number;
  message: string;
  body?: unknown;
};

export type Result<T, E = ApiError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = ApiError>(error: E): Result<never, E> {
  return { ok: false, error };
}
