"use client";

/**
 * Hook de mutación para solicitudes de eliminación de datos.
 * Sigue el patrón canónico de contact.ts: useMutation + apiSend.
 */
import { useMutation } from "@tanstack/react-query";
import { apiSend } from "@/lib/api";

export interface DataDeletionInput {
  name: string;
  email: string;
  details?: string;
  turnstileToken?: string;
}

export interface DataDeletionResponse {
  message?: string;
}

export function useDataDeletionSubmit() {
  return useMutation({
    mutationFn: (input: DataDeletionInput) =>
      apiSend<DataDeletionResponse>("POST", "/api/data-deletion", input),
  });
}
