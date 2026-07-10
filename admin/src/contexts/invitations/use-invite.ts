"use client";

import { useMutation } from "@tanstack/react-query";
import { adminFetch } from "@/src/shared/http/admin-fetch";

export interface InviteInput {
  email: string;
  roleId?: string | null;
}

export interface InviteResult {
  ok: boolean;
  emailSent: boolean;
  inviteUrl?: string; // solo en dev (sin SMTP)
  expiresAt: number;
}

export function useInvite() {
  return useMutation({
    mutationFn: async (input: InviteInput): Promise<InviteResult> => {
      const res = await adminFetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      return (await res.json()) as InviteResult;
    },
  });
}
