"use client";

/**
 * Hooks de datos del dominio "chat" (TanStack Query). Espeja el patrón canónico
 * de hooks/missing.ts:
 *  - query polleada: useQuery + queryKey de qk.chat.* + refetchInterval
 *    (pausado en background por el client). queryFn usa apiGet (ETag/304).
 *  - mutaciones: useMutation + invalidateQueries(qk.chat.all) en onSuccess.
 *  - contrato JSON idéntico al backend (GET /api/chat[?role], POST /api/chat,
 *    DELETE /api/chat/:id).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ChatMessage, ChatRole } from "@/lib/chat-types";

export interface ChatListResponse {
  messages: ChatMessage[];
}

/** Lista de mensajes (polleada). Filtra por rol cuando roleFilter !== "all". */
export function useChatMessages(roleFilter: ChatRole | "all", pollMs = 5000) {
  return useQuery({
    queryKey: qk.chat.list(roleFilter === "all" ? undefined : roleFilter),
    queryFn: ({ signal }) =>
      apiGet<ChatListResponse>(
        `/api/chat${roleFilter !== "all" ? `?role=${roleFilter}` : ""}`,
        signal,
      ),
    refetchInterval: pollMs,
    select: (data) => data.messages ?? [],
  });
}

// ---- Mutaciones ----
export interface SendChatInput {
  name: string;
  text: string;
  role: ChatRole;
  replyTo: string | null;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendChatInput) =>
      apiSend<{ message?: ChatMessage }>("POST", "/api/chat", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.chat.all }),
  });
}

export function useDeleteChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; adminToken: string }) =>
      apiSend<void>("DELETE", `/api/chat/${args.id}`, undefined, {
        "x-admin-token": args.adminToken,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.chat.all }),
  });
}
