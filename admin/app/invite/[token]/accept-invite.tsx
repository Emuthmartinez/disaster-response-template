"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Input, Button } from "@/src/ui";

interface InviteInfo {
  email: string;
  roleId: string | null;
  expiresAt: number;
}

async function fetchInvite(token: string): Promise<InviteInfo> {
  const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("invalid");
  return (await res.json()) as InviteInfo;
}

/**
 * Flujo público de aceptación de invitación: valida el token, pide nombre +
 * contraseña, y al aceptar deja la sesión iniciada (cookie httpOnly del BFF) y
 * redirige al panel.
 */
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => fetchInvite(token),
    retry: false,
  });

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isLoading) return <p className="text-sm text-gray-500">Validando invitación…</p>;

  if (isError || !invite) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4">
        <h1 className="text-lg font-bold text-red-800">Invitación no válida</h1>
        <p className="mt-1 text-sm text-red-700">
          El enlace es incorrecto, ya se usó o expiró. Pide a un administrador que te invite de nuevo.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, password, name: name || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo activar la cuenta.");
      }
      // Sesión iniciada (cookie). Al panel.
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al activar la cuenta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
      <p className="mt-1 text-sm text-gray-500">
        Invitación para <span className="font-medium">{invite.email}</span>. Define tu contraseña
        para entrar.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="Nombre (opcional)"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Input
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Activando…" : "Crear cuenta y entrar"}
        </Button>
      </form>
    </div>
  );
}
