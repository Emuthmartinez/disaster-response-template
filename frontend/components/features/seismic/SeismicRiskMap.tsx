"use client";

import dynamic from "next/dynamic";

const SeismicRiskLeafletMap = dynamic(
  () => import("@/components/features/seismic/SeismicRiskLeafletMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Cargando mapa de riesgo…
      </div>
    ),
  },
);

export default function SeismicRiskMap() {
  return <SeismicRiskLeafletMap />;
}
