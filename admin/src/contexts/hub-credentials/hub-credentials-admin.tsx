"use client";

import { useState, type FormEvent } from "react";
import { Button, Input } from "@/src/ui";
import {
  useHubCredentials,
  useIssueHubCredential,
  useRevokeHubCredential,
  detectMyIp,
  type HubCredential,
  type IssuedCredential,
} from "./use-hub-credentials";

function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString("es") : "—";
}

export function HubCredentialsAdmin() {
  const { data: creds, isLoading } = useHubCredentials();
  const issue = useIssueHubCredential();
  const revoke = useRevokeHubCredential();

  const [consumerName, setConsumerName] = useState("");
  const [ip, setIp] = useState("");
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  async function handleDetect() {
    setDetecting(true);
    setError(null);
    try {
      setIp(await detectMyIp());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo detectar la IP.");
    } finally {
      setDetecting(false);
    }
  }

  async function handleIssue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIssued(null);
    if (!consumerName.trim()) return setError("Ponle un nombre al consumidor.");
    if (!ip.trim()) return setError("Indica la IP/CIDR del consumidor.");
    try {
      const result = await issue.mutateAsync({ consumerName: consumerName.trim(), ip: ip.trim() });
      setIssued(result);
      setConsumerName("");
      setIp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir la credencial.");
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Réplica pública (SQL)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Da acceso de <strong>solo lectura</strong> por SQL crudo a la réplica
          pública. Al emitir, se crea un rol Postgres con su contraseña y se abre
          la IP del consumidor en el firewall. La contraseña se muestra{" "}
          <strong>una sola vez</strong>. Solo super administradores.
        </p>
      </div>

      {/* Credencial recién emitida — visible UNA vez */}
      {issued && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            Credencial para «{issued.credential.consumerName}». Cópiala ahora — no
            se vuelve a mostrar.
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500">host</dt>
            <dd>
              <code>{issued.connection.host}</code>
            </dd>
            <dt className="text-gray-500">dbname</dt>
            <dd>
              <code>{issued.connection.dbname}</code>
            </dd>
            <dt className="text-gray-500">user</dt>
            <dd>
              <code>{issued.connection.user}</code>
            </dd>
            <dt className="text-gray-500">password</dt>
            <dd className="break-all">
              <code>{issued.connection.password}</code>
            </dd>
          </dl>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-3 py-2 text-xs ring-1 ring-emerald-200">
              {issued.psql}
            </code>
            <Button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(issued.connection.password)}
            >
              Copiar pass
            </Button>
          </div>
        </div>
      )}

      {/* Form de emisión */}
      <form onSubmit={handleIssue} className="flex flex-col gap-4 rounded-lg border p-4">
        <Input
          label="Nombre del consumidor"
          value={consumerName}
          onChange={(e) => setConsumerName(e.target.value)}
          placeholder="p. ej. ONG Ejemplo"
          maxLength={120}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">IP / CIDR</label>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label=""
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="203.0.113.5 o 203.0.113.0/24"
              />
            </div>
            <Button type="button" variant="ghost" onClick={() => void handleDetect()} disabled={detecting}>
              {detecting ? "…" : "Usar la mía"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <Button type="submit" disabled={issue.isPending}>
            {issue.isPending ? "Emitiendo…" : "Emitir credencial"}
          </Button>
        </div>
      </form>

      {/* Lista */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Credenciales emitidas
        </h2>
        {isLoading ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : !creds || creds.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay credenciales.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {creds.map((c) => (
              <CredRow
                key={c.id}
                cred={c}
                onRevoke={() => void revoke.mutate(c.id)}
                revoking={revoke.isPending}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CredRow({
  cred,
  onRevoke,
  revoking,
}: {
  cred: HubCredential;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const revoked = cred.revokedAt !== null;
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {cred.consumerName}
          {revoked && (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
              Revocada
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          <code>{cred.pgRole}</code> · IP {cred.allowedIp} · emitida {fmt(cred.createdAt)}
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
