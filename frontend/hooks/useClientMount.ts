"use client";

import { useEffect, useState } from "react";

/**
 * Espera al próximo rAF para marcar el componente como montado en cliente.
 * Útil para componentes que dependen del DOM (Leaflet, portal, etc.).
 *
 * Mientras mounted es false el consumidor muestra un fallback.
 */
export function useClientMount() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return mounted;
}
