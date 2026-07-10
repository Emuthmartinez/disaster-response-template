"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/src/shared/http/admin-fetch";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: number | null;
}

/** Respuesta del create: incluye la llave CRUDA (única vez). */
export interface CreatedApiKey {
  apiKey: ApiKey;
  key: string;
}

const KEYS = ["admin", "api-keys"] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await adminFetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function mutateJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await adminFetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useApiKeys() {
  return useQuery({ queryKey: KEYS, queryFn: () => getJson<ApiKey[]>("/api/admin/api-keys") });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) =>
      mutateJson<CreatedApiKey>("/api/admin/api-keys", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJson<{ ok: boolean }>(`/api/admin/api-keys/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
  });
}
