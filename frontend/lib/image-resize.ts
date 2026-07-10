export const PHOTO_MAX_DIM = 960;
export const MISSING_PHOTO_MAX_DIM = 800;
export const PHOTO_JPEG_QUALITY = 0.62;

export async function fileToResizedDataUrl(
  file: File,
  maxDim: number = PHOTO_MAX_DIM,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width >= height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
}
