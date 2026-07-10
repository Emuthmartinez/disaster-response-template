"use client";

import { useEffect, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { X } from "lucide-react";

interface Props {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ImageZoomLightbox({
  src,
  alt,
  isOpen,
  onClose,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Imagen ampliada"}
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar imagen"
        className="absolute right-4 top-4 z-[3001] grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="h-full w-full p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <TransformWrapper
          doubleClick={{ mode: "toggle" }}
          maxScale={5}
          minScale={1}
          limitToBounds={false}
          wheel={{ step: 0.5 }}
          pinch={{ step: 0.5 }}
        >
          <TransformComponent
            wrapperStyle={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-full select-none object-contain"
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}
