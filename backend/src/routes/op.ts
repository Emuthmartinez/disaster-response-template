/**
 * Proxy de OpenPanel (analítica). El SECRET (OPENPANEL_CLIENT_SECRET) se usa SOLO
 * aquí, server-side, nunca llega al cliente. Mismo contrato que app/api/op/[...op]:
 *   GET  …/op1.js  -> sirve el script de OpenPanel (cacheado).
 *   POST …/track   -> reenvía el evento de tracking al API de OpenPanel.
 *
 * Hardening añadido vs. el route previo (audit): rateLimit por IP en ambos verbos
 * (el proxy hace fetch saliente; sin límite un atacante lo usa de amplificador).
 */
import { Router } from "express";
import { createHash } from "crypto";
import { asyncHandler, rateLimit } from "@/middleware";
import { env } from "@/config/env";
import { badGateway, HttpError } from "@/lib/errors";

export const opRouter = Router();

const DEFAULT_API_URL = "https://api.openpanel.dev";
const SCRIPT_URL = "https://openpanel.dev/op1.js";

function apiUrl(): string {
  return (env.OPENPANEL_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

function requestOrigin(req: import("express").Request): string {
  const origin = req.headers.origin;
  if (origin) return Array.isArray(origin) ? origin[0]! : origin;
  return `${req.protocol}://${req.get("host") ?? ""}`;
}

function forwardHeaders(req: import("express").Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "openpanel-client-id": (req.headers["openpanel-client-id"] as string) ?? "",
    origin: requestOrigin(req),
    "User-Agent": (req.headers["user-agent"] as string) ?? "",
  };
  // El SDK identifica su tipo/versión con estos headers; OpenPanel los usa para
  // atribuir el evento. Reenviarlos tal cual (no son secretos).
  for (const h of ["openpanel-sdk-name", "openpanel-sdk-version"] as const) {
    const value = req.headers[h];
    if (typeof value === "string" && value) headers[h] = value;
  }
  if (env.OPENPANEL_CLIENT_SECRET) {
    headers["openpanel-client-secret"] = env.OPENPANEL_CLIENT_SECRET;
  }
  const xff = req.headers["x-forwarded-for"];
  const ip =
    (req.headers["cf-connecting-ip"] as string) ??
    (Array.isArray(xff) ? xff[0] : xff?.split(",")[0]) ??
    (req.headers["x-vercel-forwarded-for"] as string);
  if (ip) headers["openpanel-client-ip"] = ip;
  return headers;
}

/**
 * @swagger
 * /api/op/{op}:
 *   get:
 *     tags: [system]
 *     summary: Proxy del script de OpenPanel (solo /op1.js)
 *     parameters:
 *       - in: path
 *         name: op
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Script JavaScript de OpenPanel.
 *         content: { text/javascript: {} }
 *       404:
 *         description: Ruta no soportada (no termina en /op1.js).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       500:
 *         description: Fallo al obtener el script upstream.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *   post:
 *     tags: [system]
 *     summary: Proxy de eventos de tracking de OpenPanel (solo /track)
 *     parameters:
 *       - in: path
 *         name: op
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Respuesta upstream de OpenPanel reenviada.
 *       404:
 *         description: Ruta no soportada (no contiene /track).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       500:
 *         description: Fallo al reenviar la petición a OpenPanel.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
opRouter.get(
  "/*splat",
  rateLimit({ scope: "op:script", limit: 120 }),
  asyncHandler(async (req, res) => {
    if (!req.originalUrl.split("?")[0]!.endsWith("/op1.js")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const upstream = await fetch(SCRIPT_URL, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!upstream.ok) {
        throw badGateway(`OpenPanel respondió ${upstream.status}.`);
      }
      const script = await upstream.text();
      const etag = `"${createHash("md5").update(SCRIPT_URL + script).digest("hex")}"`;
      res.setHeader("Content-Type", "text/javascript");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=86400",
      );
      res.setHeader("ETag", etag);
      res.send(script);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw badGateway("No se pudo obtener el script de OpenPanel.");
    }
  }),
);

// eslint-disable-next-line local/user-facing-mutation-needs-guard -- tracking anónimo público de OpenPanel: sin gate por diseño, protegido solo por rateLimit por IP.
opRouter.post(
  "/*splat",
  rateLimit({ scope: "op:track", limit: 240 }),
  asyncHandler(async (req, res) => {
    const pathname = req.originalUrl.split("?")[0]!;
    const trackIndex = pathname.indexOf("/track");
    if (trackIndex === -1) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const upstream = await fetch(`${apiUrl()}${pathname.slice(trackIndex)}`, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: forwardHeaders(req),
        body: JSON.stringify(req.body ?? {}),
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      res.status(upstream.status);
      if (contentType.includes("application/json")) {
        res.json(await upstream.json());
      } else {
        res.send(await upstream.text());
      }
    } catch {
      throw badGateway("No se pudo contactar OpenPanel.");
    }
  }),
);
