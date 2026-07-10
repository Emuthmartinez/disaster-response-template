/**
 * Service de admin (login). Port de lib/admin.ts: valida la contraseña contra
 * ADMIN_PASSWORD en tiempo constante. El resto de auth (header x-admin-token /
 * cron) vive en @/middleware (requireAdmin / requireCron).
 */
import { timingSafeEqual } from "crypto";
import { env } from "@/config/env";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True si el acceso admin está configurado en el servidor. */
export function isAdminConfigured(): boolean {
  return Boolean(env.ADMIN_PASSWORD);
}

/** Valida la contraseña contra ADMIN_PASSWORD (comparación constante). */
export function isValidAdminPassword(password: string | null | undefined): boolean {
  const expected = env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  return safeEqual(password, expected);
}
