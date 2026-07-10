/**
 * Transporte compartido hacia la API de ResponseGrid. Centraliza lo que repetían
 * los clientes de `acopio` (lectura) y `needs` (escritura): normalizar la baseUrl,
 * el fetch con timeout (AbortController) y resolver la emergencia por slug.
 *
 * Es AGNÓSTICO de dominio: lanza `ResponseGridHttpError` genérico; cada cliente
 * de módulo lo envuelve en su propio error de dominio (CollectionCenterProviderError
 * / NeedPublishError). Así no se acopla un módulo DDD con otro y no se duplica el
 * cableado HTTP (DRY).
 */

export const DEFAULT_RESPONSEGRID_TIMEOUT_MS = 8000;

/** Falla de transporte/HTTP contra ResponseGrid (red, timeout o status != ok). */
export class ResponseGridHttpError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ResponseGridHttpError";
  }
}

interface ResponseGridEmergency {
  id?: string;
}

export interface ResponseGridHttpOptions {
  readonly baseUrl: string;
  readonly emergencySlug: string;
  readonly timeoutMs?: number;
}

/**
 * Cliente HTTP base de ResponseGrid: baseUrl normalizada + fetch con timeout +
 * resolución de emergencia por slug (cacheada en memoria del cliente).
 */
export class ResponseGridHttp {
  protected readonly baseUrl: string;
  protected readonly emergencySlug: string;
  protected readonly timeoutMs: number;
  private emergencyId: string | null = null;

  constructor(options: ResponseGridHttpOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.emergencySlug = options.emergencySlug;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RESPONSEGRID_TIMEOUT_MS;
  }

  /** GET/POST con timeout. Lanza ResponseGridHttpError si la red falla. */
  protected async fetchWithTimeout(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (cause) {
      throw new ResponseGridHttpError("No se pudo contactar la fuente externa.", cause);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** GET + parseo JSON, con check de status. */
  protected async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchWithTimeout(path, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      throw new ResponseGridHttpError(`La fuente externa respondió ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  /** Resuelve y cachea el id de la emergencia por slug. */
  protected async resolveEmergencyId(): Promise<string> {
    if (this.emergencyId) return this.emergencyId;
    const emergency = await this.fetchJson<ResponseGridEmergency>(
      `/emergencies/by-slug/${encodeURIComponent(this.emergencySlug)}`,
    );
    if (!emergency?.id) {
      throw new ResponseGridHttpError("La fuente no reconoce la emergencia configurada.");
    }
    this.emergencyId = emergency.id;
    return emergency.id;
  }
}
