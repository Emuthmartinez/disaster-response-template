"use client";

/**
 * Overlay de detalle de un hospital. Datos vía useHospitalPatients (TanStack);
 * cero fetch a mano. JSX/Tailwind verbatim del componente original.
 */
import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import HospitalDetailView from "@/components/features/hospitals/HospitalDetailView";
import {
  buildHospitalSlug,
  FACILITY_TYPE_META,
  PRIORITY_ZONE_META,
  type Hospital,
} from "@/lib/hospitals-meta";
import { useHospitalPatients } from "@/hooks/hospitals";
import { useCopyLink } from "@/hooks/useCopyLink";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { SITE_URL } from "@/lib/site";
import { getDirectionsHref } from "./getDirectionsHref";

export default function HospitalDetailOverlay({
  hospital,
  onClose,
}: {
  hospital: Hospital;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { copied, copy: copyLink } = useCopyLink();

  const { data, isLoading, error: queryError } = useHospitalPatients(hospital.id);
  // El server puede devolver datos más frescos del hospital; si no, usamos el
  // que abrió el overlay.
  const detailHospital = data?.hospital ?? hospital;
  const patients = useMemo(() => data?.patients ?? [], [data]);
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "No se pudo cargar el hospital."
    : null;

  const zone = PRIORITY_ZONE_META[detailHospital.priorityZone];
  const facility = FACILITY_TYPE_META[detailHospital.facilityType];
  const hospitalLocation = [detailHospital.state, detailHospital.municipality]
    .filter(Boolean)
    .join(" · ");
  const directionsHref = getDirectionsHref(detailHospital);
  const hospitalSlug = buildHospitalSlug(detailHospital);
  const hospitalPath = `/hospitales/${hospitalSlug}`;

  const copyHospitalLink = useCallback(async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : SITE_URL;
    await copyLink(`${origin}${hospitalPath}`, "hospital");
  }, [copyLink, hospitalPath]);

  useOverlayDismiss(panelRef, onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de hospital ${detailHospital.name}`}
      className="fixed inset-0 z-[2100] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-3 py-5 backdrop-blur-sm sm:px-4 sm:py-8"
    >
      <div
        ref={panelRef}
        className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl"
      >
        <div
          className="border-b border-slate-200 bg-white px-5 py-4"
          style={{
            background: `linear-gradient(180deg, ${zone.color}18, #ffffff 72%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                  style={{ background: zone.color }}
                >
                  {detailHospital.priorityZone} · {zone.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm">
                  {facility.emoji} {facility.label}
                </span>
                {detailHospital.level && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm">
                    Nivel {detailHospital.level}
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-balance text-2xl font-bold tracking-tight text-slate-900">
                {detailHospital.name}
              </h3>
              {hospitalLocation && (
                <p className="mt-1 text-sm text-slate-600">{hospitalLocation}</p>
              )}
              {detailHospital.address && (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                  {detailHospital.address}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar hospital"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-xl leading-none text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Cómo llegar
            </a>
            <Link
              href={hospitalPath}
              prefetch={false}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Abrir página completa
            </Link>
            <button
              type="button"
              onClick={copyHospitalLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              aria-label={copied ? "Enlace copiado" : "Copiar enlace del hospital"}
              title={copied ? "Enlace copiado" : "Copiar enlace del hospital"}
            >
              <span aria-hidden>🔗</span>
              {copied ? "Copiado" : "Copiar link"}
            </button>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-4 sm:p-5">
          {isLoading ? (
            <p className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
              Cargando pacientes…
            </p>
          ) : error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : (
            <HospitalDetailView
              hospital={detailHospital}
              initialPatients={patients}
            />
          )}
        </div>
      </div>
    </div>
  );
}
