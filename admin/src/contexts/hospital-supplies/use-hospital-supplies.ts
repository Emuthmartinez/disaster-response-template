"use client";

/**
 * Hooks TanStack Query del contexto de insumos hospitalarios. Todo HTTP va
 * same-origin al BFF (`/api/admin/hospital-supplies/*`), que reenvía al backend
 * con la sesión; el backend decide la autorización real (hospital:read/edit).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch, type FetchInit } from "@/src/shared/http/admin-fetch";
import type { SupplyBoard, SupplyEventRow } from "./types";

const BOARD_KEY = ["hospital-supplies", "board"] as const;

async function requestJson<T>(url: string, init?: FetchInit): Promise<T> {
  const response = await adminFetch(url, init);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Error ${response.status}`);
  }
  return body as T;
}

function jsonInit(method: string, body: unknown): FetchInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function useSupplyBoard() {
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => requestJson<SupplyBoard>("/api/admin/hospital-supplies"),
    refetchInterval: 60_000,
  });
}

export function useSupplyEvents(hospitalId: string | null) {
  return useQuery({
    queryKey: ["hospital-supplies", "events", hospitalId],
    queryFn: () =>
      requestJson<{ items: SupplyEventRow[] }>(
        `/api/admin/hospital-supplies/${encodeURIComponent(hospitalId!)}/events`,
      ),
    enabled: Boolean(hospitalId),
  });
}

/**
 * Mutaciones de un hospital.
 *
 * - `onSuccess` DEVUELVE la promesa de invalidación: react-query mantiene
 *   `isPending` hasta que el board refetchea, así el control no "rebota" al
 *   valor viejo entre el write y el refetch.
 * - `lastError` refleja SOLO la última operación: se limpia al arrancar
 *   cualquier mutación y se fija en su fallo — nunca muestra un error viejo
 *   de otra mutación (el encadenado `a.error ?? b.error` sí lo hacía).
 */
export function useSupplyMutations(hospitalId: string) {
  const queryClient = useQueryClient();
  const [lastError, setLastError] = useState<Error | null>(null);
  const base = `/api/admin/hospital-supplies/${encodeURIComponent(hospitalId)}`;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: BOARD_KEY }),
      queryClient.invalidateQueries({
        queryKey: ["hospital-supplies", "events", hospitalId],
      }),
    ]);
  const clearError = (): void => setLastError(null);
  const captureError = (error: Error): void => setLastError(error);

  const updateStatus = useMutation({
    mutationFn: (body: unknown) => requestJson(`${base}/status`, jsonInit("POST", body)),
    onMutate: clearError,
    onError: captureError,
    onSuccess: refresh,
  });
  const createNeed = useMutation({
    mutationFn: (body: unknown) => requestJson(`${base}/needs`, jsonInit("POST", body)),
    onMutate: clearError,
    onError: captureError,
    onSuccess: refresh,
  });
  const patchNeed = useMutation({
    mutationFn: ({ needId, ...body }: { needId: string } & Record<string, unknown>) =>
      requestJson(`${base}/needs/${encodeURIComponent(needId)}`, jsonInit("PATCH", body)),
    onMutate: clearError,
    onError: captureError,
    onSuccess: refresh,
  });
  const patchHelp = useMutation({
    mutationFn: ({ requestId, ...body }: { requestId: string } & Record<string, unknown>) =>
      requestJson(`${base}/help/${encodeURIComponent(requestId)}`, jsonInit("PATCH", body)),
    onMutate: clearError,
    onError: captureError,
    onSuccess: refresh,
  });

  return { updateStatus, createNeed, patchNeed, patchHelp, lastError };
}
