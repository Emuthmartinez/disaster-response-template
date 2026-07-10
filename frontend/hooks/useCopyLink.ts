"use client";

import { useCallback, useState } from "react";

/**
 * Hook para copiar un enlace al portapapeles.
 * Expone `copied` (bool que se auto-resetea a los 1800ms) y `copy`.
 */
export function useCopyLink() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (url: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(`Copia el enlace${label ? ` del ${label}` : ""}`, url);
    }
  }, []);

  return { copied, copy };
}
