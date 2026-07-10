import { createHash } from "crypto";
import type { Request } from "express";
import { env } from "@/config/env";

/**
 * IP del cliente para rate-limit y hashing. La ÚNICA cabecera de la que nos
 * fiamos es la que declara EXPLÍCITAMENTE env.TRUSTED_IP_HEADER — nunca una
 * asumida por el código según el entorno. NUNCA usar el x-forwarded-for
 * crudo del cliente sin declararlo (el valor más a la izquierda es
 * inyectable y evade el rate-limit cambiando un header).
 *
 * El deploy por defecto de este template (docker-compose.prod.yml) es un
 * único VPS con Caddy terminando TLS directo, SIN proxy/CDN delante — ahí
 * NINGUNA cabecera es de confianza, porque el cliente le habla directo a
 * Caddy y puede mandar cualquier header que quiera. Por eso
 * TRUSTED_IP_HEADER default = "" (vacío): siempre cae a la IP del socket
 * (req.ip). Si tu deploy SÍ pone Cloudflare (o cualquier otro proxy que
 * reescriba la cabecera en cada hop, de forma que el cliente no pueda
 * falsificarla) delante del VPS, configura explícitamente
 * TRUSTED_IP_HEADER=cf-connecting-ip — solo entonces esa cabecera pasa a ser
 * de confianza. Sin esa configuración explícita, un atacante puede mandar
 * `cf-connecting-ip: 203.0.113.7` y falsificar la IP que ve el rate-limit/hash.
 */
export function clientIp(req: Request): string {
  const header = env.TRUSTED_IP_HEADER;
  if (header) {
    const v = req.headers[header.toLowerCase()];
    const raw = Array.isArray(v) ? v[0] : v;
    if (raw) {
      // cf-connecting-ip es un único valor; si vinieran varios, el último hop
      // (el que añadió el proxy más cercano) es el de confianza.
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1]!;
    }
  }
  return req.ip ?? "anon";
}

/**
 * Hash estable de la IP para persistir (columnas ip_hash). NUNCA guardar la IP
 * cruda: contexto humanitario. Salado con IP_SALT. Determinístico → dedup por IP.
 */
export function hashIp(req: Request): string {
  const salt = env.IP_SALT ?? "";
  return createHash("sha256").update(clientIp(req) + salt).digest("hex");
}
