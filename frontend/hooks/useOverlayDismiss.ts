"use client";

import { type RefObject, useEffect } from "react";

/**
 * Cierra un overlay al presionar Escape o al hacer clic fuera del panel.
 * @param panelRef Referencia al elemento del panel (contenido del overlay).
 * @param onClose Callback para cerrar.
 * @param active Si false, los listeners no se registran.
 */
export function useOverlayDismiss(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [panelRef, onClose, active]);
}
