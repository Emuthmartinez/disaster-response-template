/**
 * JWT de la superficie autenticada. Firma HS256 (algoritmo PINNED en verify para
 * rechazar `alg:none`/confusion). El token lleva lo mínimo: sub (user id). El
 * rol y las capacidades NO viajan en el token — se resuelven frescos desde la DB
 * en cada request (revocación inmediata; ver capability resolver).
 */
import jwt from "jsonwebtoken";
import { env } from "@/config/env";

export interface JwtPayload {
  sub: string; // user.id
}

/** Firma un access token para `userId`. Lanza si no hay JWT_SECRET configurado. */
export function signToken(userId: string): string {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET no configurado");
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_TTL_SECONDS,
  });
}

/** Verifica y devuelve el payload, o null si es inválido/expirado/mal firmado. */
export function verifyToken(token: string): JwtPayload | null {
  if (!env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "object" && decoded && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}

/** Opciones de la cookie de sesión (httpOnly + SameSite + Secure según env). */
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax", // protege CSRF en navegación normal; permite el flujo web
    path: "/",
    maxAge: env.JWT_TTL_SECONDS * 1000,
  };
}
