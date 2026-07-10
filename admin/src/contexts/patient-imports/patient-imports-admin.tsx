"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input } from "@/src/ui";
import { adminFetch, type FetchInit } from "@/src/shared/http/admin-fetch";

interface ImportSummary {
  id: string;
  status: string;
  failedStage: string | null;
  errorSummary: string | null;
  counts: Record<string, number>;
}

async function requestJson<T>(url: string, init?: FetchInit): Promise<T> {
  const response = await adminFetch(url, init);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Error ${response.status}`);
  }
  return body as T;
}

export function PatientImportsAdmin() {
  const [source, setSource] = useState("");
  const [rowsText, setRowsText] = useState("[]");
  const [importId, setImportId] = useState("");
  const create = useMutation({
    mutationFn: (body: unknown) =>
      requestJson<{ import: ImportSummary }>("/api/admin/patient-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: ({ import: created }) => setImportId(created.id),
  });
  const summary = useQuery({
    queryKey: ["patient-import", importId],
    queryFn: () =>
      requestJson<{ import: ImportSummary }>(
        `/api/admin/patient-imports/${encodeURIComponent(importId)}`,
      ),
    enabled: Boolean(importId),
    refetchInterval: ({ state }) =>
      ["queued", "pending", "processing", "applying"].includes(
        (state.data as { import?: ImportSummary } | undefined)?.import?.status ?? "",
      )
        ? 2_000
        : false,
  });
  const apply = useMutation({
    mutationFn: () =>
      requestJson(`/api/admin/patient-imports/${encodeURIComponent(importId)}/apply`, {
        method: "POST",
      }),
    onSuccess: () => summary.refetch(),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const rows = JSON.parse(rowsText) as unknown;
      if (!Array.isArray(rows)) throw new Error("Las filas deben ser un array JSON.");
      create.mutate({ source: source || undefined, contentType: "application/json", rows });
    } catch (error) {
      create.reset();
      window.alert(error instanceof Error ? error.message : "JSON inválido.");
    }
  }

  const current = summary.data?.import;
  const error = create.error ?? summary.error ?? apply.error;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Importar pacientes</h1>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded border p-4">
        <Input label="Fuente" value={source} onChange={(event) => setSource(event.target.value)} />
        <label className="text-sm font-medium">
          Filas JSON
          <textarea
            className="mt-1 min-h-40 w-full rounded border p-2 font-mono text-sm"
            value={rowsText}
            onChange={(event) => setRowsText(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Enviando…" : "Crear lote"}
        </Button>
      </form>
      <Input label="ID del lote" value={importId} onChange={(event) => setImportId(event.target.value)} />
      {current && (
        <section className="rounded border p-4">
          <h2 className="font-semibold">Estado: {current.status}</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {Object.entries(current.counts).map(([key, value]) => (
              <div key={key}><dt className="text-gray-500">{key}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          {current.errorSummary && <p className="mt-2 text-red-600">{current.errorSummary}</p>}
          {(current.status === "processed" ||
            (current.status === "failed" && current.failedStage === "apply")) && (
            <Button className="mt-4" type="button" onClick={() => apply.mutate()}>
              Aplicar filas válidas
            </Button>
          )}
        </section>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error.message}</p>}
    </div>
  );
}
