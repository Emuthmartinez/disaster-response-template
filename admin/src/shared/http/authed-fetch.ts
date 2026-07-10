/**
 * Puente BFF → backend autenticado.
 *
 * Lee el JWT de la cookie de sesión del request entrante (admin_session) y
 * devuelve un HttpClient apuntando al backend `emergency` con
 * `Authorization: Bearer <jwt>`. El backend (extractToken) prioriza Bearer, así
 * evitamos reenviar cookies cross-domain.
 *
 * Devuelve null si no hay sesión → el route handler responde 401 sin llamar al
 * backend.
 */
import type { HttpClient } from "./http-client";
import { createHttpClient } from "./http-client";
import { getApiBaseUrl } from "../../config/api-registry";
import { readSessionToken } from "../auth/session-cookie";

export function createAuthedEmergencyClient(request: Request): HttpClient | null {
  const token = readSessionToken(request);
  if (!token) return null;
  return createHttpClient({
    baseUrl: getApiBaseUrl("emergency"),
    defaultHeaders: { Authorization: `Bearer ${token}` },
  });
}
