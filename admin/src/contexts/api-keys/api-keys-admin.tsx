"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button, Input } from "@/src/ui";
import { useAdminSessionContext } from "@/src/shared/auth/admin-session-context";
import { useCapabilities } from "@/src/contexts/roles/use-roles";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  type ApiKey,
  type CreatedApiKey,
} from "./use-api-keys";

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Sin expiración", days: null },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "1 año", days: 365 },
];

function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString("es") : "—";
}

export function ApiKeysAdmin() {
  const { capabilities, can } = useAdminSessionContext();
  const { data: catalog } = useCapabilities();
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `now` capturado una vez (no Date.now() en render — regla de pureza).
  const [now] = useState(() => Date.now());

  // Solo puedes scopear una llave a capacidades que TÚ tienes. El admin ("*")
  // ve todo el catálogo; el resto, la intersección con sus propias caps.
  const isAdmin = capabilities.includes("*");
  const scopeable = useMemo(() => {
    const all = catalog ?? [];
    return isAdmin ? all : all.filter((c) => can(c.key));
  }, [catalog, isAdmin, can]);

  const toggle = (key: string) =>
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!name.trim()) return setError("Ponle un nombre a la llave.");
    if (scopes.size === 0) return setError("Elige al menos un scope.");
    const expiresAt =
      expiryDays === null ? null : Date.now() + expiryDays * 24 * 60 * 60 * 1000;
    try {
      const result = await createKey.mutateAsync({
        name: name.trim(),
        scopes: [...scopes],
        expiresAt,
      });
      setCreated(result);
      setName("");
      setScopes(new Set());
      setExpiryDays(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la llave.");
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">API Keys</h1>
        <p className="mt-1 text-sm text-gray-500">
          Crea llaves para integraciones que llaman al backend en tu nombre. La
          llave se muestra <strong>una sola vez</strong>; guárdala al crearla. Cada
          llave queda limitada a los scopes que elijas (no puede hacer más de lo
          que tú puedes).
        </p>
      </div>

      {/* Llave recién creada — visible UNA vez */}
      {created && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Llave creada: «{created.apiKey.name}». Cópiala ahora — no se vuelve a
            mostrar.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-3 py-2 text-sm ring-1 ring-emerald-200">
              {created.key}
            </code>
            <Button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(created.key)}
            >
              Copiar
            </Button>
          </div>
        </div>
      )}

      {/* Form de creación */}
      <form onSubmit={handleCreate} className="flex flex-col gap-4 rounded-lg border p-4">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="p. ej. Integración CI"
          maxLength={80}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Expiración
          </label>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setExpiryDays(o.days)}
                aria-pressed={expiryDays === o.days}
                className={`rounded-full border px-3 py-1 text-sm ${
                  expiryDays === o.days
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Scopes (solo los que tú tienes)
          </label>
          {scopeable.length === 0 ? (
            <p className="text-sm text-gray-500">No tienes capacidades asignables.</p>
          ) : (
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded border p-2 sm:grid-cols-2">
              {scopeable.map((c) => (
                <label key={c.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.has(c.key)}
                    onChange={() => toggle(c.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <code className="text-xs">{c.key}</code>
                    <span className="block text-xs text-gray-500">{c.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <Button type="submit" disabled={createKey.isPending}>
            {createKey.isPending ? "Creando…" : "Crear llave"}
          </Button>
        </div>
      </form>

      {/* Lista de llaves */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tus llaves
        </h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : !keys || keys.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no tienes llaves.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.map((k) => (
              <ApiKeyRow
                key={k.id}
                apiKey={k}
                onRevoke={() => void revokeKey.mutate(k.id)}
                revoking={revokeKey.isPending}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
  revoking,
  now,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
  revoking: boolean;
  now: number;
}) {
  const revoked = apiKey.revokedAt !== null;
  const expired = apiKey.expiresAt !== null && apiKey.expiresAt <= now;
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {apiKey.name || "(sin nombre)"}{" "}
          <code className="ml-1 text-xs text-gray-500">{apiKey.prefix}…</code>
          {revoked && (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
              Revocada
            </span>
          )}
          {!revoked && expired && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
              Expirada
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {apiKey.scopes.length} scope(s) · creada {fmt(apiKey.createdAt)} · último uso{" "}
          {fmt(apiKey.lastUsedAt)} · expira {fmt(apiKey.expiresAt)}
        </p>
      </div>
      {!revoked && (
        <Button type="button" variant="ghost" onClick={onRevoke} disabled={revoking}>
          Revocar
        </Button>
      )}
    </li>
  );
}
