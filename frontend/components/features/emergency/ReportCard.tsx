"use client";

import { memo } from "react";
import { REPORT_TYPES, type EmergencyReport } from "@/lib/types";
import { freshnessClass, timeAgo } from "@/lib/format";
import { mediaUrl } from "@/lib/api";

export interface ReportCardProps {
  report: EmergencyReport;
  now: number;
  confirmed: boolean;
  isAdmin: boolean;
  onFocus: (report: EmergencyReport) => void;
  onConfirm: (id: string) => void;
  onResolve: (id: string) => void;
}

function ReportCardImpl({
  report,
  now,
  confirmed,
  isAdmin,
  onFocus,
  onConfirm,
  onResolve,
}: ReportCardProps) {
  return (
    <li className="relative rounded-xl border border-slate-200">
      {/* Toda la card (incluida el área libre) enfoca el reporte
          en el mapa; los botones de acción quedan por encima. */}
      <button
        type="button"
        onClick={() => onFocus(report)}
        aria-label={`Ver ${report.place} en el mapa`}
        className="absolute inset-0 rounded-xl transition hover:bg-slate-50 active:bg-slate-100"
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {report.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl(report.photoUrl)}
              alt=""
              loading="lazy"
              className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {REPORT_TYPES[report.type].emoji} {report.place}
            </p>
            {report.affected > 0 && (
              <p className="text-xs text-slate-600">
                {report.affected} persona(s) afectada(s)
              </p>
            )}
            {report.needs && (
              <p className="text-xs text-slate-600">{report.needs}</p>
            )}
            <p
              className={`mt-1 text-[11px] font-medium ${freshnessClass(report.createdAt, now)}`}
              title={new Date(report.createdAt).toLocaleString("es")}
            >
              🕒 {timeAgo(report.createdAt, now)}
            </p>
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => onConfirm(report.id)}
            disabled={confirmed}
            aria-label={
              confirmed
                ? "Ya confirmaste este reporte"
                : "Confirmar que veo este reporte"
            }
            title={
              confirmed ? "Ya confirmaste este reporte" : "Yo también veo esto"
            }
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
              confirmed
                ? "border-slate-200 bg-slate-100 text-slate-500"
                : "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
            }`}
          >
            ✓ +{report.confirmations}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onResolve(report.id)}
              className="rounded-md border border-[var(--m-blue-100)] bg-white px-2 py-1 text-[11px] font-medium e-m-link hover:bg-[var(--m-blue-50)]"
            >
              Atendido
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export const ReportCard = memo(ReportCardImpl);
export default ReportCard;
