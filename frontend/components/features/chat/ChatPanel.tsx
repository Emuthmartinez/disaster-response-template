"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLowBandwidthMode } from "@/hooks/useLowBandwidthMode";
import { trackEvent } from "@/lib/openpanel";
import { useTurnstile } from "@/hooks/useTurnstile";
import {
  useChatMessages,
  useDeleteChatMessage,
  useSendChatMessage,
} from "@/hooks/chat";
import {
  CHAT_ROLES,
  CHAT_ROLE_KEYS,
  getRoleMeta,
  isValidChatRole,
  type ChatMessage,
  type ChatRole,
} from "@/lib/chat-types";

interface ChatNode {
  message: ChatMessage;
  children: ChatNode[];
}

const POLL_INTERVAL_MS = 5000;
const LOW_BANDWIDTH_POLL_INTERVAL_MS = 30_000;
const ADMIN_STORAGE_KEY = "emergency:adminToken";
const NAME_STORAGE_KEY = "emergency:chatName";
const ROLE_STORAGE_KEY = "emergency:chatRole";
const MAX_TEXT = 500;
const MAX_THREAD_DEPTH = 6;

function buildForest(messages: ChatMessage[]): ChatNode[] {
  const byId = new Map<string, ChatNode>();
  const roots: ChatNode[] = [];

  // Primera pasada: crear nodos.
  for (const message of messages) {
    byId.set(message.id, { message, children: [] });
  }

  // Segunda pasada: enlazar padres-hijos.
  for (const message of messages) {
    const node = byId.get(message.id)!;
    if (message.replyTo && byId.has(message.replyTo)) {
      const parent = byId.get(message.replyTo)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Ordenar raíces por threadBumpedAt descendente (más reciente primero).
  roots.sort((a, b) => b.message.threadBumpedAt - a.message.threadBumpedAt);

  // Ordenar hijos cronológicamente en cada nivel.
  const sortChildren = (nodes: ChatNode[]) => {
    nodes.sort((a, b) => a.message.createdAt - b.message.createdAt);
    for (const node of nodes) sortChildren(node.children);
  };
  sortChildren(roots);

  return roots;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPanel() {
  const [name, setName] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (localStorage.getItem(NAME_STORAGE_KEY) ?? ""),
  );
  const [role, setRole] = useState<ChatRole>(() => {
    if (typeof window === "undefined") return "citizen";
    const stored = localStorage.getItem(ROLE_STORAGE_KEY);
    return isValidChatRole(stored ?? "") ? (stored as ChatRole) : "citizen";
  });
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [roleFilter, setRoleFilter] = useState<ChatRole | "all">("all");
  const network = useLowBandwidthMode(
    POLL_INTERVAL_MS,
    LOW_BANDWIDTH_POLL_INTERVAL_MS,
  );

  const { data: messages = [] } = useChatMessages(
    roleFilter,
    network.pollIntervalMs,
  );
  const sendMutation = useSendChatMessage();
  const deleteMutation = useDeleteChatMessage();
  const sending = sendMutation.isPending;
  const { mountRef: turnstileMount, getToken: turnstileGetToken } = useTurnstile();

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // El token admin vive en sessionStorage (no es dato de red): re-leerlo al
  // montar y al volver la pestaña a primer plano, como hacía el poller previo.
  useEffect(() => {
    const read = () => setAdminToken(sessionStorage.getItem(ADMIN_STORAGE_KEY));
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  useEffect(() => {
    if (atBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const handleRoleChange = useCallback((next: ChatRole) => {
    setRole(next);
    localStorage.setItem(ROLE_STORAGE_KEY, next);
    setShowRolePicker(false);
  }, []);

  const handleSend = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      const trimmed = text.trim();
      if (!trimmed) return;
      localStorage.setItem(NAME_STORAGE_KEY, name.trim());
      try {
        // Token FRESCO de Turnstile para este envío (se resetea tras leerlo).
        const turnstileToken = await turnstileGetToken();
        await sendMutation.mutateAsync({
          name: name.trim(),
          text: trimmed,
          role,
          replyTo: replyingTo?.id ?? null,
          turnstileToken,
        });
        trackEvent("chat_message_sent", {
          role,
          hasReply: Boolean(replyingTo),
          lengthBucket:
            trimmed.length < 80 ? "short" : trimmed.length < 240 ? "medium" : "long",
        });
        setText("");
        setReplyingTo(null);
        atBottomRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al enviar.");
      }
    },
    [text, name, role, replyingTo, sendMutation, turnstileGetToken],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!adminToken) return;
      deleteMutation.mutate({ id, adminToken });
    },
    [adminToken, deleteMutation],
  );

  const forest = useMemo(() => buildForest(messages), [messages]);

  const handleReply = useCallback((message: ChatMessage) => {
    setReplyingTo(message);
    textareaRef.current?.focus();
  }, []);

  const renderMessage = (
    node: ChatNode,
    depth: number,
    isRoot: boolean,
  ): ReactElement => {
    const { message, children } = node;
    const meta = getRoleMeta(message.role);
    const hasReplies = children.length > 0;
    const isReply = depth > 0;

    return (
      <div
        key={message.id}
        className={`${isRoot ? "mt-3 first:mt-0" : "mt-2"}`}
      >
        <div
          className={`group relative rounded-xl border bg-white px-3 py-2 shadow-sm transition hover:shadow-md ${
            isReply
              ? "border-slate-100"
              : replyingTo?.id === message.id
                ? "border-sky-300 ring-1 ring-sky-200"
                : "border-slate-200"
          }`}
        >
          {message.replyPreview && (
            <div className="mb-1.5 border-l-2 border-slate-300 pl-2 text-xs text-slate-500">
              <span className="line-clamp-2">{message.replyPreview}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: meta.color }}
                title={meta.description}
              >
                <span aria-hidden>{meta.icon}</span>
                <span className="truncate">{meta.label}</span>
              </span>
              <span className="truncate text-sm font-semibold text-slate-900">
                {message.name}
              </span>
            </div>
            <span className="shrink-0 text-[11px] text-slate-400">
              {formatTime(message.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
            {message.text}
          </p>
          <div className="mt-1.5 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => handleReply(message)}
              className="text-[11px] font-medium text-slate-500 hover:text-sky-700"
            >
              Responder
            </button>
            {adminToken && (
              <button
                type="button"
                onClick={() => handleDelete(message.id)}
                className="text-[11px] font-medium text-slate-500 hover:text-red-600"
              >
                Borrar
              </button>
            )}
          </div>
        </div>

        {hasReplies && depth < MAX_THREAD_DEPTH && (
          <div className="relative mt-1 pl-4 sm:pl-6">
            <div className="absolute bottom-0 left-2 top-0 w-px bg-slate-200 sm:left-3" />
            {children.map((child) => renderMessage(child, depth + 1, false))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="chat" className="mx-auto w-full max-w-7xl px-4 pb-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-lg font-bold text-slate-900">
          🤝 Espacio de voluntarios
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Espacio de intercambio de información entre voluntarios. Coordínense,
          compartan información verificada y ofrezcan o pidan apoyo. Sean
          respetuosos: no compartan datos sensibles ni difundan rumores sin
          confirmar.
        </p>

        {/* Filtros por rol */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              roleFilter === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
            }`}
          >
            Todos
          </button>
          {CHAT_ROLE_KEYS.map((r) => {
            const m = CHAT_ROLES[r];
            const active = roleFilter === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span aria-hidden>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Selector de rol propio */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Participas como:</span>
          <button
            type="button"
            onClick={() => setShowRolePicker((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            style={{ color: CHAT_ROLES[role].color }}
          >
            <span>{CHAT_ROLES[role].icon}</span>
            {CHAT_ROLES[role].label}
            <span aria-hidden>▾</span>
          </button>
          {showRolePicker && (
            <div className="mt-2 w-full">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CHAT_ROLE_KEYS.map((r) => {
                  const m = CHAT_ROLES[r];
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        role === r
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span aria-hidden>{m.icon}</span>
                      <div>
                        <p className="font-semibold">{m.label}</p>
                        <p
                          className={`text-[10px] ${
                            role === r ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {m.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="mt-4 h-[60vh] max-h-[420px] min-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 sm:h-[400px] sm:max-h-none"
        >
          {messages.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-slate-400">
              Aún no hay mensajes. ¡Escribe el primero!
            </p>
          ) : forest.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-slate-400">
              No hay mensajes para este filtro.
            </p>
          ) : (
            forest.map((root) => renderMessage(root, 0, true))
          )}
        </div>

        <form onSubmit={handleSend} className="mt-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre (opcional)"
            maxLength={40}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 sm:max-w-xs"
          />

          {replyingTo && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <span className="truncate">
                Respondiendo a{" "}
                <strong>
                  {replyingTo.name} ({CHAT_ROLES[replyingTo.role].label})
                </strong>
                : {replyingTo.text}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="shrink-0 rounded-md px-1.5 py-0.5 font-semibold hover:bg-sky-100"
                aria-label="Cancelar respuesta"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(e);
                }
              }}
              rows={2}
              maxLength={MAX_TEXT}
              placeholder="Describe la ayuda que puedes ofrecer"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button
              type="submit"
              data-track="chat_send_clicked"
              disabled={sending || !text.trim()}
              className="h-[42px] shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "…" : "Enviar"}
            </button>
          </div>
          <div ref={turnstileMount} className="flex justify-center empty:hidden" />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </section>
  );
}
