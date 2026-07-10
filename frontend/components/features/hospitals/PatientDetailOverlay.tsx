"use client";

/** Overlay de detalle de un paciente. JSX/Tailwind verbatim del original. */
import { useCallback, useRef } from "react";
import Link from "next/link";
import {
  buildHospitalSlug,
  PATIENT_CONDITION_META,
  PATIENT_STATUS_META,
} from "@/lib/hospitals-meta";
import type { PatientSearchResult } from "@/hooks/hospitals";
import { useCopyLink } from "@/hooks/useCopyLink";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { SITE_URL } from "@/lib/site";
import { getDirectionsHref } from "./getDirectionsHref";
import { DetailRow } from "./atoms";

export default function PatientDetailOverlay({
  result,
  onClose,
}: {
  result: PatientSearchResult;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { copied, copy: copyLink } = useCopyLink();
  const { patient, hospital } = result;
  const condition = PATIENT_CONDITION_META[patient.condition];
  const status = PATIENT_STATUS_META[patient.status];
  const hospitalLocation = [hospital.state, hospital.municipality]
    .filter(Boolean)
    .join(" · ");
  const directionsHref = getDirectionsHref(hospital);
  const patientPath = `/hospitales/${buildHospitalSlug(hospital)}#paciente-${patient.id}`;

  const copyPatientLink = useCallback(async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : SITE_URL;
    await copyLink(`${origin}${patientPath}`, "paciente");
  }, [copyLink, patientPath]);

  useOverlayDismiss(panelRef, onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de paciente ${patient.name}`}
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Paciente registrado
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">
              {patient.name}
            </h3>
            {patient.age !== null && (
              <p className="mt-0.5 text-sm text-slate-500">
                {patient.age} años
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xl leading-none text-slate-600 transition hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: status.color }}
          >
            {status.label}
          </span>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ background: condition.color }}
          >
            {condition.label}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <DetailRow label="Hospital" value={hospital.name} />
          <DetailRow label="Ubicación" value={hospitalLocation} />
          <DetailRow
            label="Registrado"
            value={new Date(patient.admittedAt).toLocaleString("es")}
          />
          <DetailRow
            label="Actualizado"
            value={new Date(patient.updatedAt).toLocaleString("es")}
          />
          {patient.contact && <DetailRow label="Contacto" value={patient.contact} />}
        </dl>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                Dirección del hospital
              </p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900">
                {hospital.address || hospitalLocation || hospital.name}
              </p>
              {hospital.address && hospitalLocation && (
                <p className="mt-1 text-xs text-slate-600">{hospitalLocation}</p>
              )}
            </div>
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Cómo llegar
            </a>
          </div>
        </div>

        {patient.notes && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notas
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {patient.notes}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link
            href={patientPath}
            prefetch={false}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Abrir hospital
          </Link>
          <button
            type="button"
            onClick={copyPatientLink}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            aria-label={copied ? "Enlace copiado" : "Copiar enlace del paciente"}
            title={copied ? "Enlace copiado" : "Copiar enlace del paciente"}
          >
            <span aria-hidden>🔗</span>
            {copied ? "Copiado" : "Copiar link"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
