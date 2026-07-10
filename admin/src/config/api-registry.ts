/**
 * API registry — maps logical API identifiers to base URLs read from env.
 *
 * Server-side only (BFF route handlers). The browser never reads these: it
 * talks same-origin to the BFF (`/api/*`), which then calls the backend.
 *
 * `emergency` resuelve a EMERGENCY_API_URL, con fallback a INTERNAL_API_URL
 * (red interna del cluster, p.ej. http://api.internal.svc.cluster.local) y
 * luego a NEXT_PUBLIC_API_URL — mismo patrón que frontend/lib/server-api.ts.
 *
 * Throws a clear configuration error if no base URL is set or it's not a valid
 * absolute URL. Trailing slashes are stripped to avoid `https://x//api/…`.
 */

export type ApiId = "emergency" | "supplies";

// Orden de resolución por API: primer env var con valor gana.
const ENV_KEYS: Record<ApiId, readonly string[]> = {
  emergency: ["EMERGENCY_API_URL", "INTERNAL_API_URL", "NEXT_PUBLIC_API_URL"],
  supplies: ["SUPPLIES_API_URL"],
};

export function getApiBaseUrl(id: ApiId): string {
  const keys = ENV_KEYS[id];
  let value: string | undefined;
  let usedKey = keys[0];
  for (const key of keys) {
    if (process.env[key]) {
      value = process.env[key];
      usedKey = key;
      break;
    }
  }
  if (!value) {
    throw new Error(`${keys.join(" / ")} is not set`);
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`${usedKey} is not a valid URL: ${value}`);
  }
  return value.replace(/\/+$/, "");
}
