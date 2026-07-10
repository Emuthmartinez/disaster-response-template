"use client";

import { apiFetch } from "@/lib/api";
import type { QueuedPayload } from "@/lib/offline-queue";
import type { EmergencyReport } from "@/lib/types";

export type SubmitOutcome =
  | { status: "ok"; report?: EmergencyReport }
  | { status: "queue" }
  | { status: "drop"; error: string };

export async function postReportToServer(
  payload: QueuedPayload,
): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await apiFetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: "queue" };
  }
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return { status: "ok", report: data.report };
  }
  if (res.status === 429 || res.status === 503) return { status: "queue" };
  const data = await res.json().catch(() => ({}));
  return {
    status: "drop",
    error: data.error ?? "No se pudo publicar la alerta.",
  };
}
