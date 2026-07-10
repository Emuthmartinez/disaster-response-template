"use client";

import { useEffect, useState } from "react";

const DEFAULT_TICK_MS = 30_000;

/** Reloj cliente que avanza cada `intervalMs` (p. ej. etiquetas timeAgo). */
export function useTick(intervalMs = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
