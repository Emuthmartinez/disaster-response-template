"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/src/shared/http/admin-fetch";

export interface HubCredential {
  id: string;
  consumerName: string;
  pgRole: string;
  allowedIp: string;
  createdAt: number;
  revokedAt: number | null;
}

export interface IssueInput {
  consumerName: string;
  ip: string;
}

/** Respuesta del issue: incluye la conexión + password CRUDA (única vez). */
export interface IssuedCredential {
  credential: HubCredential;
  connection: {
    host: string;
    port: number;
    dbname: string;
    user: string;
    password: string;
  };
  psql: string;
}

const KEYS = ["admin", "hub-credentials"] as const;

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

export function useHubCredentials() {
  return useQuery({
    queryKey: KEYS,
    queryFn: () => getJson<HubCredential[]>("/api/admin/hub-credentials"),
  });
}

export function useIssueHubCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IssueInput) =>
      mutateJson<IssuedCredential>("/api/admin/hub-credentials", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
  });
}

export function useRevokeHubCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateJson<{ ok: boolean }>(`/api/admin/hub-credentials/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
  });
}

/** Detecta la IP del solicitante (para prellenar el form). */
export async function detectMyIp(): Promise<string> {
  const r = await mutateJson<{ ip: string }>(
    "/api/admin/hub-credentials/detect-ip",
    "POST",
  );
  return r.ip;
}
