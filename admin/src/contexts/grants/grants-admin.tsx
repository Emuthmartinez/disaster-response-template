"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@/src/ui";
import { adminFetch, type FetchInit } from "@/src/shared/http/admin-fetch";
import { useAdminSessionContext } from "@/src/shared/auth/admin-session-context";

interface Grant {
  id: string;
  capabilityKey: string;
  subjectUserId: string | null;
  revokedAt: number | null;
}

async function json<T>(url: string, init?: FetchInit): Promise<T> {
  const response = await adminFetch(url, init);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Error ${response.status}`);
  }
  return body as T;
}

export function GrantsAdmin() {
  const { can } = useAdminSessionContext();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [capabilityKey, setCapabilityKey] = useState("");
  const [reason, setReason] = useState("");
  const grants = useQuery({
    queryKey: ["admin", "grants", userId],
    queryFn: () =>
      json<Grant[]>(`/api/admin/grants${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`),
  });
  const mutate = useMutation({
    mutationFn: ({ url, init }: { url: string; init: FetchInit }) => json(url, init),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "grants"] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutate.mutate({
      url: "/api/admin/grants",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, capabilityKey, reason: reason || undefined }),
      },
    });
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <h1 className="text-2xl font-bold">Grants individuales</h1>
      {can("grant:manage") && (
        <form onSubmit={submit} className="grid gap-3 rounded border p-4 sm:grid-cols-2">
          <Input label="Usuario ID" required value={userId} onChange={(e) => setUserId(e.target.value)} />
          <Input label="Capacidad" required value={capabilityKey} onChange={(e) => setCapabilityKey(e.target.value)} />
          <Input label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" disabled={mutate.isPending}>Conceder</Button>
        </form>
      )}
      {(grants.error ?? mutate.error) && (
        <p role="alert" className="text-sm text-red-600">{(grants.error ?? mutate.error)?.message}</p>
      )}
      <ul className="flex flex-col gap-2">
        {(grants.data ?? []).map((grant) => (
          <li key={grant.id} className="flex justify-between rounded border p-3 text-sm">
            <span>
              <code>{grant.capabilityKey}</code> · usuario {grant.subjectUserId ?? "—"}
              {grant.revokedAt && " · revocado"}
            </span>
            {can("grant:manage") && !grant.revokedAt && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  mutate.mutate({
                    url: `/api/admin/grants/${encodeURIComponent(grant.id)}`,
                    init: { method: "DELETE" },
                  })
                }
              >
                Revocar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
