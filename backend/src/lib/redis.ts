/**
 * Cliente Valkey/Redis del backend. OPCIONAL y fail-open: si no hay VALKEY_URL o
 * la conexión cae, getRedisSafe() devuelve null y el rate-limit degrada a memoria
 * en vez de romper el request (contexto humanitario: jamás 500 por Valkey).
 */
import IORedis from "ioredis";
import { env } from "@/config/env";

let _client: IORedis | null = null;
let _tried = false;

export function getRedisSafe(): IORedis | null {
  if (_client) return _client;
  if (_tried) return null;
  _tried = true;
  if (!env.VALKEY_URL) return null;
  try {
    _client = new IORedis(env.VALKEY_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      // enableOfflineQueue:true (default) — los comandos esperan a que la
      // conexión esté lista (unos ms al arrancar) en vez de fallar con "Stream
      // isn't writeable". commandTimeout sigue rechazando rápido si Valkey está
      // muerto → checkRateLimit cae a memoria (fail-open).
      enableOfflineQueue: true,
    });
    _client.on("error", () => {
      /* el modo degradado lo maneja checkRateLimit */
    });
    return _client;
  } catch {
    return null;
  }
}
