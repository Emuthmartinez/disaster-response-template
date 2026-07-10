/**
 * Middleware compartido. El objetivo: que cada endpoint declare sus protecciones
 * en 1-2 líneas y NO repita lógica de auth/rate-limit/captcha/validación.
 *
 * Uso típico de una mutación pública:
 *   router.post("/",
 *     rateLimit({ scope: "missing:create", limit: 10 }),
 *     requireHuman,                       // Cloudflare Turnstile
 *     validate({ body: createMissingSchema }),
 *     asyncHandler(createMissing),
 *   )
 *
 * Mutación admin:
 *   router.delete("/:id", requireAdmin, asyncHandler(deleteMissing))
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { clientIp } from "@/lib/client-ip";
import { HttpError, tooManyRequests, badRequest, unauthorized, forbidden } from "@/lib/errors";
import { env } from "@/config/env";
import { timingSafeEqual } from "crypto";

/** Envuelve un handler async para que los throws lleguen al errorHandler. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void> | void,
): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}

/** Rate-limit por IP (cf-connecting-ip) + scope. Valkey-backed, fail-open. */
export function rateLimit(opts: { scope: string; limit: number; windowMs?: number }): RequestHandler {
  return (req, _res, next) => {
    checkRateLimit(`${opts.scope}:${clientIp(req)}`, { limit: opts.limit, windowMs: opts.windowMs })
      .then((ok) => {
        if (!ok) throw tooManyRequests("Vas muy rápido. Espera un momento e inténtalo de nuevo.");
        next();
      })
      .catch(next);
  };
}

/** Prueba de humanidad: Cloudflare Turnstile. Bloquea bots en writes públicos. */
export const requireHuman: RequestHandler = (req, _res, next) => {
  verifyTurnstile(req)
    .then((human) => {
      if (!human) throw forbidden("Verificación anti-bot fallida. Recarga e inténtalo de nuevo.");
      next();
    })
    .catch(next);
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Auth de admin (x-admin-token == ADMIN_PASSWORD), comparación constante. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const expected = env.ADMIN_PASSWORD;
  const got = req.headers["x-admin-token"];
  if (!expected || typeof got !== "string" || !safeEqual(got, expected)) {
    return next(unauthorized("Se requiere token de administrador."));
  }
  next();
};

/** Auth de cron (Authorization: Bearer CRON_SECRET) o admin. */
export const requireCron: RequestHandler = (req, _res, next) => {
  const secret = env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (secret && auth && safeEqual(auth, `Bearer ${secret}`)) return next();
  // un admin también puede dispararlo
  const expected = env.ADMIN_PASSWORD;
  const got = req.headers["x-admin-token"];
  if (expected && typeof got === "string" && safeEqual(got, expected)) return next();
  next(unauthorized("Se requiere secreto de cron o token de administrador."));
};

/** Validación zod de body/query/params. Reemplaza los datos por los parseados. */
export function validate(schemas: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (e) {
      const msg = e instanceof Error && "issues" in e
        ? (e as { issues: { message: string }[] }).issues.map((i) => i.message).join("; ")
        : "Datos inválidos.";
      next(badRequest(msg));
    }
  };
}

/** Error handler central: traduce HttpError (y desconocidos) a JSON { error }. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
    res.status(err.status).json({ error: err.message });
    return;
  }
  // No filtrar detalles internos al cliente.
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Error interno del servidor." });
}
