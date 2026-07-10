"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/src/shared/http/admin-fetch";

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  capabilities: string[];
  createdAt: number;
  updatedAt: number | null;
}

export interface Capability {
  key: string;
  description: string;
  category: string;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  capabilities: string[];
}

const ROLES_KEY = ["admin", "roles"] as const;
const CAPS_KEY = ["admin", "capabilities"] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await adminFetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: () => getJson<Role[]>("/api/admin/roles") });
}

export function useCapabilities() {
  return useQuery({
    queryKey: CAPS_KEY,
    queryFn: () => getJson<Capability[]>("/api/admin/capabilities"),
    staleTime: 5 * 60_000, // el catálogo es fijo
  });
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  capabilities?: string[];
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

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => mutateJson<Role>("/api/admin/roles", "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) =>
      mutateJson<Role>(`/api/admin/roles/${id}`, "PATCH", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateJson<{ ok: boolean }>(`/api/admin/roles/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}
