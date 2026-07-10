import { createHash } from "crypto";
import type { Request, Response } from "express";

/**
 * Responde JSON con ETag derivado del contenido. Si el cliente manda
 * If-None-Match igual, devuelve 304 vacío. Bajo polling esto corta ancho de
 * banda (el frontend usa cache:"no-cache" → revalida → 304 mientras no cambie).
 * Mantiene el MISMO comportamiento que el jsonWithEtag del app Next previo.
 */
export function jsonWithEtag(
  req: Request,
  res: Response,
  data: unknown,
  headers: Record<string, string> = {},
): void {
  const json = JSON.stringify(data);
  const etag = `"${createHash("sha1").update(json).digest("base64")}"`;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(json);
}
