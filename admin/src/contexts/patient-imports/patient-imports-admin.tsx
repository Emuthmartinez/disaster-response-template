"use client";

/**
 * Importación de pacientes en lote: subir un archivo CSV/XLSX (o pegar filas
 * JSON), seguir el procesamiento (validación + dedupe corren en la cola),
 * REVISAR las filas antes de aplicar y aplicar las válidas. El estado del
 * lote se lee de la base (summary), no del job.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input } from "@/src/ui";
import { adminFetch, type FetchInit } from "@/src/shared/http/admin-fetch";
import { ImportRowsTable } from "./import-rows-table";

interface ImportSummary {
  id: string;
  status: string;
  failedStage: string | null;
  errorSummary: string | null;
  counts: Record<string, number>;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// El backend acepta cuerpos JSON de hasta 4 MB y el base64 infla ~33%: por
// encima de ~2.8 MB de archivo, el envío rebotaría con un error genérico.
// Mejor cortarlo aquí con causa clara ANTES de leer y subir.
const MAX_FILE_BYTES = 2_800_000;

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  queued: "En cola",
  processing: "Procesando…",
  processed: "Procesado — revisa y aplica",
  applying: "Aplicando…",
  applied: "Aplicado",
  failed: "Fallido",
};

async function requestJson<T>(url: string, init?: FetchInit): Promise<T> {
  const response = await adminFetch(url, init);
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Error ${response.status}`);
  }
  return body as T;
}

/** Lee un File del input como base64 (sin el prefijo data:). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function PatientImportsAdmin() {
  const [mode, setMode] = useState<"file" | "json">("file");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rowsText, setRowsText] = useState("[]");
  const [importId, setImportId] = useState("");

  const create = useMutation({
    mutationFn: (body: unknown) =>
      requestJson<{ import: ImportSummary }>("/api/admin/patient-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: ({ import: created }) => {
      setImportId(created.id);
      setFile(null);
      setApplyEnFlight(false);
    },
  });

  // Declarado ANTES del useQuery: refetchInterval cierra sobre esta variable.
  const [applyEnFlight, setApplyEnFlight] = useState(false);

  const summary = useQuery({
    queryKey: ["patient-import", importId],
    queryFn: () =>
      requestJson<{ import: ImportSummary }>(
        `/api/admin/patient-imports/${encodeURIComponent(importId)}`,
      ),
    enabled: Boolean(importId),
    refetchInterval: ({ state }) => {
      const status =
        (state.data as { import?: ImportSummary } | undefined)?.import?.status ?? "";
      if (["pending", "queued", "processing", "applying"].includes(status)) return 2_000;
      // Ventana post-apply: seguir sondeando "processed" hasta que el
      // consumidor de la cola lo mueva a applied/failed.
      if (applyEnFlight && status !== "applied" && status !== "failed") return 2_000;
      return false;
    },
  });

  // El apply responde 202 al ENCOLAR: el estado sigue "processed" hasta que
  // el consumidor de la cola corre. Sin la ventana applyEnFlight, un único
  // refetch vería "processed", el polling se apagaría y la pantalla quedaría
  // congelada.
  const apply = useMutation({
    mutationFn: () =>
      requestJson(`/api/admin/patient-imports/${encodeURIComponent(importId)}/apply`, {
        method: "POST",
      }),
    onSuccess: () => {
      setApplyEnFlight(true);
      void summary.refetch();
    },
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (mode === "file") {
        if (!file) throw new Error("Elige un archivo CSV o XLSX.");
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(
            `El archivo pesa ${(file.size / 1_000_000).toFixed(1)} MB y el máximo es ~2.8 MB. Divide el lote en archivos más pequeños.`,
          );
        }
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        const contentType = CONTENT_TYPE_BY_EXTENSION[extension];
        if (!contentType) throw new Error("Solo CSV o XLSX.");
        const fileBase64 = await fileToBase64(file);
        create.mutate({ source: source || undefined, contentType, fileBase64 });
        return;
      }
      const rows = JSON.parse(rowsText) as unknown;
      if (!Array.isArray(rows)) throw new Error("Las filas deben ser un array JSON.");
      create.mutate({ source: source || undefined, contentType: "application/json", rows });
    } catch (error) {
      create.reset();
      window.alert(error instanceof Error ? error.message : "Entrada inválida.");
    }
  }

  const current = summary.data?.import;
  const error = create.error ?? summary.error ?? apply.error;
  const canApply =
    current &&
    (current.status === "processed" ||
      (current.status === "failed" && current.failedStage === "apply"));
  const showRows =
    current && ["processed", "applying", "applied", "failed"].includes(current.status);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Importar pacientes</h1>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded border p-4">
        <div className="flex gap-2 text-sm">
          <Button
            type="button"
            variant={mode === "file" ? undefined : "ghost"}
            onClick={() => setMode("file")}
          >
            Archivo CSV/XLSX
          </Button>
          <Button
            type="button"
            variant={mode === "json" ? undefined : "ghost"}
            onClick={() => setMode("json")}
          >
            Filas JSON
          </Button>
        </div>

        <Input label="Fuente (opcional)" value={source} onChange={(event) => setSource(event.target.value)} />

        {mode === "file" ? (
          <label className="text-sm font-medium">
            Archivo (CSV o XLSX, máx. ~3 MB)
            <input
              type="file"
              accept=".csv,.xlsx"
              className="mt-1 block w-full rounded border p-2 text-sm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file && <span className="mt-1 block text-xs text-gray-500">{file.name}</span>}
          </label>
        ) : (
          <label className="text-sm font-medium">
            Filas JSON
            <textarea
              className="mt-1 min-h-40 w-full rounded border p-2 font-mono text-sm"
              value={rowsText}
              onChange={(event) => setRowsText(event.target.value)}
            />
          </label>
        )}

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Enviando…" : "Crear lote"}
        </Button>
      </form>

      <Input
        label="ID del lote (se rellena al crear; pega uno para retomarlo)"
        value={importId}
        onChange={(event) => {
          setImportId(event.target.value);
          setApplyEnFlight(false);
        }}
      />

      {current && (
        <section className="flex flex-col gap-3 rounded border p-4">
          <h2 className="font-semibold">
            Estado: {STATUS_LABELS[current.status] ?? current.status}
          </h2>
          <dl className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
            {Object.entries(current.counts).map(([key, value]) => (
              <div key={key}>
                <dt className="text-gray-500">{key}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {current.errorSummary && <p className="text-sm text-red-600">{current.errorSummary}</p>}
          {canApply && (
            <Button type="button" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? "Aplicando…" : "Aplicar filas válidas"}
            </Button>
          )}
          {showRows && (
            <ImportRowsTable
              importId={current.id}
              // Refresco vivo mientras el lote sigue moviéndose (apply en
              // vuelo o estado no terminal): las filas pasan de valid →
              // applying → applied sin recargar la página.
              live={
                ["processing", "applying"].includes(current.status) ||
                (applyEnFlight && current.status !== "applied" && current.status !== "failed")
              }
            />
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}
    </div>
  );
}
