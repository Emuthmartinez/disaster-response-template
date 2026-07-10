"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModelRow } from "../application/models-gateway";
import { adminFetch } from "../../../shared/http/admin-fetch";

/**
 * Hook de listado de un modelo vía el BFF same-origin (/api/models/<path>).
 *
 * El BFF ya devuelve filas limpias; aquí solo gestionamos cache/estado con
 * TanStack Query. El fetch lanza en error (contrato de React Query) — único
 * punto de throw sancionado en este contexto.
 */
async function fetchModel(path: string): Promise<ModelRow[]> {
  const res = await adminFetch(`/api/models/${path}`);
  if (!res.ok) {
    throw new Error(`No se pudo cargar ${path} (${res.status})`);
  }
  return (await res.json()) as ModelRow[];
}

async function mutateModel(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  id?: string,
  input?: ModelRow,
): Promise<unknown> {
  const url = `/api/models/${path}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const response = await adminFetch(url, {
    method,
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${response.status}`);
  }
  return response.json();
}

export function useModelList(path: string) {
  return useQuery({
    queryKey: ["model", path],
    queryFn: () => fetchModel(path),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useModelMutation(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (operation: {
      method: "POST" | "PATCH" | "DELETE";
      id?: string;
      input?: ModelRow;
    }) => mutateModel(path, operation.method, operation.id, operation.input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["model", path] }),
  });
}
