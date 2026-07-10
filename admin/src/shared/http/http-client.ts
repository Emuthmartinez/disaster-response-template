/**
 * Domain-agnostic HTTP client factory.
 *
 * createHttpClient({ baseUrl, defaultHeaders? }) returns a client with:
 *   get<T>(path, opts?)   => Promise<Result<T>>
 *   post<T>(path, body, opts?) => Promise<Result<T>>
 *
 * Never throws — all error paths return Result.
 *
 * Error mapping:
 *   2xx  → ok(parsedJson)
 *   401  → err({ kind: "auth",    status: 401 })
 *   !ok  → err({ kind: "http",    status })
 *   fetch rejects → err({ kind: "network" })
 *   json() throws → err({ kind: "parse" })
 */

import type { ApiError, Result } from "../result";
import { err, ok } from "../result";

export type RequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type HttpClientConfig = {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
};

export type HttpClient = {
  get<T>(path: string, opts?: RequestOptions): Promise<Result<T>>;
  post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<Result<T>>;
  patch<T>(path: string, body: unknown, opts?: RequestOptions): Promise<Result<T>>;
  delete<T>(path: string, opts?: RequestOptions): Promise<Result<T>>;
};

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl, defaultHeaders = {} } = config;

  async function request<T>(
    method: string,
    path: string,
    opts: RequestOptions & { body?: unknown },
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {
      ...defaultHeaders,
      ...opts.headers,
    };

    const fetchInit: {
      method: string;
      headers: Record<string, string>;
      signal?: AbortSignal;
      body?: string;
    } = { method, headers, signal: opts.signal };

    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchInit.body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, fetchInit);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network request failed";
      return err<ApiError>({ kind: "network", message });
    }

    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : response.statusText || `HTTP error ${response.status}`;
      return err<ApiError>({
        kind: response.status === 401 ? "auth" : "http",
        status: response.status,
        message,
        body,
      });
    }

    let data: T;
    try {
      data = (await response.json()) as T;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to parse response body";
      return err<ApiError>({ kind: "parse", message });
    }

    return ok<T>(data);
  }

  return {
    get<T>(path: string, opts: RequestOptions = {}): Promise<Result<T>> {
      return request<T>("GET", path, opts);
    },

    post<T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<Result<T>> {
      return request<T>("POST", path, { ...opts, body });
    },

    patch<T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<Result<T>> {
      return request<T>("PATCH", path, { ...opts, body });
    },

    delete<T>(path: string, opts: RequestOptions = {}): Promise<Result<T>> {
      return request<T>("DELETE", path, opts);
    },
  };
}
