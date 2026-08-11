"use client";

import { useEffect, useState } from "react";
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
  // El chequeo de hostname va en un efecto, NO en el render: decidir el árbol
  // con `typeof window` hace que el servidor pinte null y el cliente pinte el
  // componente en el MISMO primer render → mismatch de hidratación (React #418)
  // en CADA carga. Con el gate de montaje (mismo patrón que
  // useLowBandwidthMode) ambos primeros renders son null y el script de
  // analítica se monta un tick después, sin perder eventos.
  const [shouldRender, setShouldRender] = useState(false);
  useEffect(() => {
    // setState aquí es intencional (gate de montaje, una sola vez): el hostname
    // solo existe en el cliente y leerlo durante el render rompe la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShouldRender(window.location.hostname === PRODUCTION_HOST);
  }, []);
  if (!shouldRender) return null;

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
