"use client";

import { OpenPanelComponent } from "@openpanel/nextjs";
import { apiUrl } from "@/lib/api";
import { deploymentConfig } from "@/lib/deployment-config";

const PRODUCTION_HOST =
  process.env.NEXT_PUBLIC_OPENPANEL_PRODUCTION_HOST ?? deploymentConfig.domains.web;

export default function OpenPanelProduction({
  clientId,
}: {
  clientId: string;
}) {
  if (typeof window === "undefined") return null;
  if (window.location.hostname !== PRODUCTION_HOST) return null;

  return (
    <OpenPanelComponent
      // El proxy de OpenPanel vive en el BACKEND (`/api/op/*`, ver
      // backend/src/routes/op.ts). Tras el split web/api, pasar rutas relativas
      // las resolvería contra el origen del frontend (domains.web), que ya no
      // sirve `/api/op` → script 404 y eventos perdidos. `apiUrl()` las ancla
      // a API_BASE (domains.api).
      apiUrl={apiUrl("/api/op")}
      scriptUrl={apiUrl("/api/op/op1.js")}
      clientId={clientId}
      trackScreenViews
      trackOutgoingLinks
      trackAttributes
    />
  );
}
