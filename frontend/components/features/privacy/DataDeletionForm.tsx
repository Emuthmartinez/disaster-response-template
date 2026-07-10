"use client";

import { useState } from "react";
import LegalConsentNotice from "@/components/content/LegalConsentNotice";
import { CONTACT_EMAIL } from "@/lib/site";
import { useDataDeletionSubmit } from "@/hooks/data-deletion";
import { useTurnstile } from "@/hooks/useTurnstile";

export default function DataDeletionForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const deletionMutation = useDataDeletionSubmit();
  const submitting = deletionMutation.isPending;
  const { mountRef: turnstileMount, getToken: turnstileGetToken } = useTurnstile();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const turnstileToken = await turnstileGetToken();
    deletionMutation.mutate(
      { name, email, details: details || undefined, turnstileToken },
      {
        onSuccess: (data) => {
          setSuccess(
            data.message ??
              "Solicitud recibida. Te contactaremos para procesar la eliminación de tus datos.",
          );
          setName("");
          setEmail("");
          setDetails("");
        },
        onError: (err) => {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo enviar la solicitud.",
          );
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="e-inner space-y-4">
      <div className="e-form2">
        <div>
          <label
            htmlFor="deletion-name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Tu nombre
          </label>
          <input
            id="deletion-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            className="e-input py-2.5"
          />
        </div>
        <div>
          <label
            htmlFor="deletion-email"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Tu correo
          </label>
          <input
            id="deletion-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            required
            className="e-input py-2.5"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="deletion-details"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Detalles adicionales (opcional)
        </label>
        <textarea
          id="deletion-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Ej.: Quiero eliminar los reportes que hice desde el email… (opcional)"
          className="e-input min-h-[100px] resize-y py-2.5"
        />
      </div>

      <p className="text-xs text-[var(--etext2)]">
        Los datos enviados se procesarán internamente ({CONTACT_EMAIL}). Te
        responderemos al correo indicado para confirmar la eliminación.
      </p>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p className="e-m-alert-success">
          {success}
        </p>
      )}

      <div ref={turnstileMount} className="flex justify-center empty:hidden" />

      <LegalConsentNotice className="text-xs text-[var(--etext2)]" />

      <button
        type="submit"
        disabled={submitting}
        className="e-btn e-btn-primary px-5 py-3 disabled:opacity-60"
      >
        {submitting ? "Enviando…" : "Solicitar eliminación de datos"}
      </button>
    </form>
  );
}
