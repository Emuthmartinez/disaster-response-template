/**
 * Wrapper de fetch tipado para el frontend. ÚNICO punto de red.
 *
 * Arquitectura: frontend y backend son servicios SEPARADOS (tier web vs tier api,
 * subdominio api.<dominio> con su propio LB — ver config/deployment.config.json
 * → domains.api). El frontend llama al backend por su URL ABSOLUTA (patrón
 * estándar SPA/Next + API aparte), NO por rutas relativas. El backend habilita
 * CORS para el origen del frontend.
 *
 *  - API_BASE = NEXT_PUBLIC_API_URL (p.ej. https://api.example.org en
 *    prod, http://localhost:8080 en dev). Si no está seteada, en development
 *    cae a http://localhost:8080 (igual que server-api.ts); en prod/test queda "".
 *  - se pasan credenciales (cookies) con credentials:"include" por si el backend
 *    usa sesión/cookies; los tokens admin van por header donde aplica.
 *  - GET con cache:"no-cache" => revalida con If-None-Match => 304 vacío si nada
 *    cambió (NUNCA no-store, que tira ese ahorro).
 *  - timeout con AbortController (no deja fetches huérfanos).
 *  - errores tipados (ApiError con status).
 *
 * TanStack Query maneja cache/dedup/poll/refetch; este módulo solo habla HTTP.
 */
const DEFAULT_TIMEOUT_MS = 8000;

function resolveApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "development") return "http://localhost:8080";
  return "";
}

/** URL base del backend. Vacío => mismo origen (fallback SSR/test en prod). */
export const API_BASE = resolveApiBase();

/**
 * Base pública del CDN R2 de fotos (no sensible). Las fotos se sirven vía el
 * redirect del backend (`/api/.../photo` → R2), así que el render NO depende de
 * esto; queda expuesto para construir enlaces directos al CDN si hicieran falta.
 */
export const R2_PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "").replace(/\/$/, "");

/** Antepone API_BASE a rutas que empiezan con "/" (deja URLs absolutas intactas). */
function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

/**
 * Resuelve una ruta relativa de la API a una URL absoluta contra `API_BASE`.
 * Útil cuando un consumidor necesita construir la URL manualmente (p.ej. para
 * `<script src>`, `<img src>` arbitrario, o pasársela a una librería externa).
 * Se exporta también como sinónimo público de `resolveUrl`. Acepta URLs ya
 * absolutas y las devuelve intactas.
 */
export function apiUrl(path: string): string {
  return resolveUrl(path);
}

/**
 * Resuelve una URL de media (fotos) servida por el backend. El backend devuelve
 * rutas RELATIVAS (`/api/missing/:id/photo`) que, en un `<img src>`, el browser
 * resolvería contra el origen de la PÁGINA (:3000) en vez del backend (:8080) →
 * 404. Esto las ancla a API_BASE. Si el backend ya devolviera una URL absoluta
 * de R2/CDN, se deja intacta. Acepta null/"" y lo propaga.
 */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return resolveUrl(path);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Encadena el signal de TanStack Query (cancela al cambiar queryKey) con el timeout.
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(resolveUrl(path), {
      signal: ctrl.signal,
      credentials: "include",
      ...rest,
    });
    if (!res.ok) {
      let msg = `${rest.method ?? "GET"} ${path} -> ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        /* sin cuerpo JSON */
      }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** GET para queries. cache:"no-cache" => aprovecha ETag/304. */
export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { cache: "no-cache", signal });
}

/** Mutaciones. JSON body. */
export function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * Wrapper de `fetch` que ancla la URL a `API_BASE` y agrega `credentials:"include"`
 * por defecto. Devuelve el `Response` crudo SIN parsear (a diferencia de
 * `apiGet`/`apiSend`) — pensado para casos donde el caller necesita revisar el
 * status, leer el body como texto, o pasar headers customizados como
 * `x-admin-token` sin tipar la respuesta.
 *
 * Acepta paths relativos (`/api/...`) o URLs absolutas (se dejan intactas).
 * NO aplica timeout propio: si lo necesitas, pásalo en `init.signal`.
 */
export function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(resolveUrl(path), {
    credentials: "include",
    ...init,
  });
}
