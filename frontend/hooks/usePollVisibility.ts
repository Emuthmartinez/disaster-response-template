"use client";

import { useEffect, useRef } from "react";

/**
 * Ejecuta `poll` cada `intervalMs` mientras la página esté visible.
 * Pausa automáticamente cuando la pestaña está en segundo plano.
 * No ejecuta `poll` en el primer render (solo tras el primer intervalo).
 */
export function usePollVisibility(
  poll: () => void,
  intervalMs: number,
  active = true,
) {
  const savedPoll = useRef(poll);

  useEffect(() => {
    savedPoll.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        savedPoll.current();
      }
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, active]);
}
