"use client";

import { useEffect } from "react";

/** Registra el service worker en producción, una sola vez por carga. */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // No bloqueamos la app por un fallo de registro.
      });
  }, []);
  return null;
}
