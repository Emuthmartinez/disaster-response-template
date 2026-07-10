"use client";

import { useState, type FormEvent } from "react";
import { Input, Button } from "@/src/ui";
import { useInvite } from "./use-invite";
import { useRoles } from "../roles/use-roles";

/**
 * Formulario de invitación: email + rol (opcional). Llama al BFF /api/admin/invite.
 * En dev (sin SMTP) el backend devuelve inviteUrl, que mostramos para copiar.
 */
export function InviteForm() {
  const invite = useInvite();
  const { data: roles } = useRoles();

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [result, setResult] = useState<{ emailSent: boolean; inviteUrl?: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setResult(null);
    const r = await invite.mutateAsync({ email, roleId: roleId || null });
    setResult({ emailSent: r.emailSent, inviteUrl: r.inviteUrl });
    setEmail("");
    setRoleId("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex max-w-md flex-col gap-4">
      <Input
        label="Email del invitado"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <div>
        <label htmlFor="invite-role" className="mb-1 block text-sm font-medium">
          Rol (opcional)
        </label>
        <select
          id="invite-role"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="w-full rounded border px-3 py-2 text-sm"
        >
          <option value="">— Sin rol —</option>
          {(roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {invite.isError && (
        <p role="alert" className="text-sm text-red-600">
          {invite.error instanceof Error ? invite.error.message : "Error al invitar."}
        </p>
      )}

      {result && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-800">
            {result.emailSent ? "Invitación enviada por email." : "Invitación creada."}
          </p>
          {result.inviteUrl && (
            <p className="mt-1 break-all text-gray-700">
              Sin SMTP — comparte este enlace: <span className="font-mono">{result.inviteUrl}</span>
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={invite.isPending || !email}>
        {invite.isPending ? "Enviando…" : "Invitar"}
      </Button>
    </form>
  );
}
