/**
 * Errores HTTP tipados. Los handlers lanzan estos; el errorHandler central los
 * traduce a la respuesta JSON estándar { error } con el status correcto. Así
 * ningún handler arma respuestas de error a mano ni filtra stack traces.
 */
export class HttpError extends Error {
  status: number;
  /** cabeceras extra (p.ej. Retry-After en 429). */
  headers?: Record<string, string>;
  constructor(status: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = "No autorizado") => new HttpError(401, m);
export const forbidden = (m = "Prohibido") => new HttpError(403, m);
export const notFound = (m = "No encontrado") => new HttpError(404, m);
export const notImplemented = (m: string) => new HttpError(501, m);
export const payloadTooLarge = (m: string) => new HttpError(413, m);
export const tooManyRequests = (m: string, retryAfter = 30) =>
  new HttpError(429, m, { "Retry-After": String(retryAfter) });
export const badGateway = (m: string) => new HttpError(502, m);
export const serviceUnavailable = (m: string) => new HttpError(503, m);
