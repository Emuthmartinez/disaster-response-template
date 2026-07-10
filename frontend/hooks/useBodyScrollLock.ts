"use client";

import { useEffect } from "react";

/**
 * Bloquea el scroll del body mientras `active` sea true.
 * Restaura el valor original al desmontar o al cambiar a false.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [active]);
}
