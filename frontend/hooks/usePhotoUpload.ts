"use client";

import { useCallback, useRef, useState } from "react";
import {
  PHOTO_MAX_DIM,
  fileToResizedDataUrl,
} from "@/lib/image-resize";

interface UsePhotoUploadOptions {
  maxDim?: number;
  /** Called when the photo handler needs to set an error (invalid type, process failure). */
  onError?: (msg: string) => void;
}

interface UsePhotoUploadReturn {
  fileRef: React.RefObject<HTMLInputElement | null>;
  photo: string | null;
  setPhoto: React.Dispatch<React.SetStateAction<string | null>>;
  processing: boolean;
  handleFile: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearPhoto: () => void;
}

export function usePhotoUpload({
  maxDim = PHOTO_MAX_DIM,
  onError,
}: UsePhotoUploadOptions = {}): UsePhotoUploadReturn {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        onError?.("Selecciona un archivo de imagen.");
        return;
      }
      onError?.("");
      setProcessing(true);
      try {
        setPhoto(await fileToResizedDataUrl(file, maxDim));
      } catch {
        onError?.("No se pudo procesar la imagen. Intenta con otra foto.");
      } finally {
        setProcessing(false);
      }
    },
    [maxDim, onError],
  );

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  return { fileRef, photo, setPhoto, processing, handleFile, clearPhoto };
}
