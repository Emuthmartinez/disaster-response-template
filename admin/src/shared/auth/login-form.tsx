"use client";

import { useState, type FormEvent } from "react";
import { Input, Button } from "@/src/ui";

export interface LoginFormProps {
  /** Llamado con email+password al enviar. Puede lanzar en error de auth. */
  onSubmit: (email: string, password: string) => Promise<void>;
}

/**
 * Formulario de login (email + password) construido con los atoms de @/src/ui.
 * Posee email, password, pending y error; delega la lógica de auth a onSubmit.
 * Un rechazo de onSubmit se muestra como mensaje de error en español.
 */
export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit(email, password);
    } catch {
      setError("Credenciales inválidas. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900">Panel de administración</h1>
      <p className="mt-1 text-sm text-gray-500">Inicia sesión para continuar.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
