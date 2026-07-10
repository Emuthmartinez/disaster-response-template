import { env } from "@/config/env";
import { clientIp } from "@/lib/client-ip";
import type { Request } from "express";

/**
 * Verifica un token de Cloudflare Turnstile contra siteverify (prueba de
 * humanidad en writes públicos). El secreto SOLO se usa aquí en el backend.
 *
 * El cliente envía el token en la cabecera `cf-turnstile-token` (o en el body
 * `turnstileToken`). Cada token es de un solo uso y caduca a los 300s.
 *
 * Si TURNSTILE_SECRET_KEY no está configurada (dev local), verifyTurnstile
 * devuelve true (desactivado) — así el desarrollo no exige captcha. En prod la
 * clave SIEMPRE está, por lo que el gate es real.
 *
 * SEMÁNTICA DE FALLO (importante en app de emergencia — vida humana):
 *   - Token ausente o vacío        -> RECHAZA (false). Es la señal típica de bot.
 *   - siteverify responde success  -> pasa/rechaza según success.
 *   - siteverify INALCANZABLE (red/timeout/500) -> FAIL-OPEN (true) para NO
 *     bloquear a víctimas reales por un blip de Cloudflare. Se loguea un warning.
 * Este fail-open SOLO cubre el fallo de transporte; un token inválido
 * (success:false) siempre se rechaza, así el gate anti-bot sigue vivo.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;

export async function verifyTurnstile(req: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // desactivado en dev (sin secret)

  const token =
    (req.headers["cf-turnstile-token"] as string | undefined) ??
    (typeof req.body === "object" && req.body
      ? (req.body as Record<string, unknown>).turnstileToken
      : undefined);

  if (typeof token !== "string" || !token) return false;

  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: clientIp(req),
      }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // siteverify inalcanzable: fail-OPEN a propósito. En una app de reporte de
    // emergencias, bloquear a una víctima real porque Cloudflare no respondió es
    // peor que dejar pasar una request sin verificar durante un outage. El resto
    // de defensas (rateLimit + dedup por hashIp + validación zod) siguen activas.
    console.warn("turnstile: siteverify inalcanzable, fail-open");
    return true;
  }
}
