"use client";

import { deploymentConfig } from "@/lib/deployment-config";

type OpenPanelWindow = Window & {
  op?: (method: "track", event: string, properties?: Record<string, unknown>) => void;
};

const PRODUCTION_HOST =
  process.env.NEXT_PUBLIC_OPENPANEL_PRODUCTION_HOST ?? deploymentConfig.domains.web;

function isProductionHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname === PRODUCTION_HOST;
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!isProductionHost()) return;
  (window as OpenPanelWindow).op?.("track", event, {
    path: window.location.pathname,
    ...properties,
  });
}
