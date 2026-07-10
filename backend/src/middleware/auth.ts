/**
 * Middleware de autenticación + autorización para `api/public/*`.
 *
 * Doble credencial (web + integraciones), normalizada a un mismo `req.user`:
 *   1) `Authorization: Bearer <jwt>`  — Postman / integraciones / (futuras) API keys.
 *   2) Cookie httpOnly de sesión       — el frontend web (credentials:include).
 * Se lee el header PRIMERO, luego la cookie. El endpoint no sabe cuál se usó.
 *
 * Patrón de uso de un endpoint autenticado de api/public/*:
 *   router.post("/",
 *     rateLimit({ scope: "report:create", limit: 60 }),
 *     requireCapability("report:create"),   // implica requireAuth
 *     validate({ body: createSchema }),
 *     asyncHandler(create),
 *   )
 *
 * `requireCapability` SIEMPRE autentica primero (deny-by-default): sin sesión
 * válida -> 401; con sesión pero sin la capacidad -> 403.
 */
import type { Request, RequestHandler } from "express";
import { unauthorized, forbidden } from "@/lib/errors";
import { env } from "@/config/env";
import { verifyToken } from "@/auth/jwt";
import { loadAuthUser, userHasCapability, type AuthUser } from "@/auth/resolve";
import { looksLikeApiKey, resolveApiKey } from "@/services/api-keys";

// Aumenta el tipo de Express Request con el usuario autenticado + cache de caps.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      capCache?: Map<string, boolean>;
    }
  }
}

/** Extrae el token: Authorization: Bearer ... primero, luego la cookie. */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const fromCookie = cookies?.[env.AUTH_COOKIE_NAME];
  return fromCookie || null;
}

/**
 * Resuelve un token a un AuthUser, sea API KEY o JWT:
 *  - Si tiene forma de API key (`mer_sk_…`): hash → lookup → llave activa → carga
 *    el usuario y le adjunta los scopes de la llave (techo least-privilege). La
 *    cookie nunca lleva una API key (guarda un JWT), así que el prefijo basta
 *    para distinguir sin ambigüedad.
 *  - Si no: verifica el JWT y carga el usuario (sesión normal, sin acotar).
 * Devuelve null si el token es inválido / la llave está revocada o expirada / el
 * usuario no existe o está desactivado.
 */
async function resolvePrincipal(token: string): Promise<AuthUser | null> {
  if (looksLikeApiKey(token)) {
    const resolved = await resolveApiKey(token);
    if (!resolved) return null;
    const user = await loadAuthUser(resolved.userId);
    if (!user) return null;
    return { ...user, apiKeyScopes: resolved.scopes };
  }
  const payload = verifyToken(token);
  if (!payload) return null;
  return loadAuthUser(payload.sub);
}

/**
 * Resuelve la sesión y cuelga `req.user` (sin fallar si no hay). Útil para
 * endpoints que adaptan su respuesta a autenticado/anónimo. NO bloquea.
 */
export const attachUser: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  resolvePrincipal(token)
    .then((u) => {
      if (u) {
        req.user = u;
        req.capCache = new Map();
      }
      next();
    })
    .catch(next);
};

/** Exige sesión válida. 401 si no hay token/usuario. Cuelga `req.user`. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(unauthorized("Se requiere autenticación."));
  resolvePrincipal(token)
    .then((u) => {
      if (!u) return next(unauthorized("Sesión inválida o expirada."));
      req.user = u;
      req.capCache = new Map();
      next();
    })
    .catch(next);
};

/**
 * Exige una capacidad concreta. Autentica primero (deny-by-default). El admin
 * semilla pasa siempre; el resto necesita la cap en su rol o un grant activo.
 */
export function requireCapability(capability: string): RequestHandler {
  return (req, res, next) => {
    // Reusa la cadena de requireAuth, luego checa la capacidad.
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      const user = req.user!;
      userHasCapability(user, capability, req.capCache)
        .then((ok) => {
          if (!ok) return next(forbidden("No tienes permiso para esta acción."));
          next();
        })
        .catch(next);
    });
  };
}

/**
 * Como requireCapability pero pasa si el usuario tiene CUALQUIERA de las
 * capacidades dadas (OR). Para recursos compartidos por varias funciones —p.ej.
 * el catálogo de capacidades, que necesitan tanto quien gestiona roles
 * (role:read) como quien crea API keys (apikey:manage) para elegir scopes.
 * Mantiene "requireCapability" en el nombre para la regla ESLint deny-by-default.
 */
export function requireAnyCapability(...capabilities: string[]): RequestHandler {
  return (req, res, next) => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      const user = req.user!;
      Promise.all(capabilities.map((c) => userHasCapability(user, c, req.capCache)))
        .then((results) => {
          if (!results.some(Boolean)) {
            return next(forbidden("No tienes permiso para esta acción."));
          }
          next();
        })
        .catch(next);
    });
  };
}
