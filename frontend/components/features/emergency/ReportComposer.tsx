"use client";

import dynamic from "next/dynamic";
import type { ReportType } from "@/lib/types";

export interface ReportComposerSubmit {
  type: ReportType;
  place: string;
  affected: number;
  needs: string;
  photo: string | null;
}

// El formulario de reporte es un modal grande (campos + foto + cámara). Fuera del
// bundle inicial: solo se carga cuando el usuario abre "+ Reportar".
const ReportForm = dynamic(() => import("@/components/features/emergency/ReportForm"), {
  ssr: false,
});

export interface ReportComposerProps {
  open: boolean;
  coords: { lat: number; lng: number } | null;
  hidden: boolean;
  queuedFlash: boolean;
  onPickOnMap: () => void;
  onClearLocation: () => void;
  onCancel: () => void;
  onCoordsChange: (coords: { lat: number; lng: number }) => void;
  onSubmit: (payload: ReportComposerSubmit) => Promise<void>;
}

export default function ReportComposer({
  open,
  coords,
  hidden,
  queuedFlash,
  onPickOnMap,
  onClearLocation,
  onCancel,
  onCoordsChange,
  onSubmit,
}: ReportComposerProps) {
  return (
    <>
      {open && (
        <ReportForm
          coords={coords}
          hidden={hidden}
          onPickOnMap={onPickOnMap}
          onClearLocation={onClearLocation}
          onCancel={onCancel}
          onCoordsChange={onCoordsChange}
          onSubmit={onSubmit}
        />
      )}

      {queuedFlash && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-4 z-[2500] mx-auto w-fit max-w-[92%] rounded-full bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
        >
          ✅ Reporte guardado. Se enviará automáticamente cuando vuelva la
          conexión.
        </div>
      )}
    </>
  );
}
