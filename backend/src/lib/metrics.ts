/**
 * Métricas Prometheus del backend (formato `prom-client`). Expone `/metrics`
 * (texto plano que Prometheus/Alloy scrapea) y un middleware que instrumenta
 * CADA request HTTP: total, errores y duración por método/ruta/status.
 *
 * Cómo llega al command center: los pods de prod NO empujan; solo EXPONEN
 * `/metrics`. Grafana Alloy (DaemonSet en k3s) lo scrapea y lo empuja al VPS de
 * observability (ver observability/). Alloy enriquece con `tier`/`pod`/`namespace`
 * desde las labels del pod, así que aquí NO hace falta auto-identificar el tier.
 *
 * Cardinalidad: la label `route` usa el PATRÓN de ruta de Express
 * (`/api/missing/:id`), no el path crudo, para no explotar en series por cada id.
 */
import http from "http";
import client, { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { clientIp } from "@/lib/client-ip";

export const register = new Registry();

// Métricas por defecto del proceso/runtime (heap de V8, event-loop lag, CPU,
// GC, handles…). Útiles para vigilar salud del pod, no solo el HTTP.
collectDefaultMetrics({ register });

const LABELS = ["method", "route", "status_code"] as const;

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total de requests HTTP",
  labelNames: LABELS,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duración de la request HTTP en segundos",
  labelNames: LABELS,
  // Buckets afinados para una API web: desde 10ms hasta 5s.
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpErrorsTotal = new Counter({
  name: "http_errors_total",
  help: "Total de respuestas HTTP de error (4xx + 5xx)",
  labelNames: LABELS,
  registers: [register],
});

/**
 * Normaliza la ruta a su PATRÓN para acotar cardinalidad. Prefiere el patrón que
 * matcheó Express (`req.route.path`, p.ej. `/:id`), con su `baseUrl` (el prefijo
 * del router, p.ej. `/api/missing`). Si no hay patrón (404, middleware), colapsa
 * segmentos largos/dinámicos (ids, uuids) a `/:id`.
 */
function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    const base = req.baseUrl || "";
    const path = typeof req.route.path === "string" ? req.route.path : "";
    return `${base}${path}` || req.path;
  }
  return req.path.replace(/\/[0-9a-fA-F-]{8,}/g, "/:id").replace(/\/\d+/g, "/:id");
}

/**
 * Middleware: mide la request al terminar la respuesta. No toca el body ni
 * cabeceras sensibles; solo método, patrón de ruta y status.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normalizeRoute(req);
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationS);
    if (res.statusCode >= 400) httpErrorsTotal.inc(labels);

    // Access log estructurado (JSON a stdout) que Loki tail-ea. Lleva la IP REAL
    // (clientIp): es la práctica estándar de observabilidad para detección de
    // abuso — el panel "top IPs que nos martillan" (LogQL `topk by (ip)`) solo es
    // ACCIONABLE con la IP cruda (la bloqueas en Cloudflare/firewall; un hash no
    // sirve para eso). La IP NUNCA se mete como label de métrica Prometheus (bomba
    // de cardinalidad): vive solo en el log.
    //
    // Distinción clave (no confundir con la regla de la BD): la prohibición de IPs
    // crudas aplica a la BASE DE DATOS pública/consultable (ahí se usa hashIp en
    // contact/dedup/rate-limit). Estos son LOGS internos, efímeros (retención
    // corta en Loki) y con acceso controlado (Caddy + bearer token, no públicos).
    try {
      console.log(
        JSON.stringify({
          t: "access",
          method: req.method,
          route,
          status: res.statusCode,
          dur_ms: Math.round(durationS * 1000),
          ip: clientIp(req),
        }),
      );
    } catch {
      // Nunca dejar que el logging tumbe la request.
    }
  });
  next();
}

/**
 * Servidor de métricas SEPARADO, en su propio puerto (METRICS_PORT, default
 * 9090). AISLAMIENTO: el LB público (mapa-api-lb) solo enruta el puerto de la
 * app (:8080), nunca este — así `/metrics` es INACCESIBLE desde internet
 * (defensa primaria, ver observability/). Alloy (DaemonSet en k3s) lo scrapea
 * pod-a-pod por la red interna.
 *
 * Defensa en profundidad: si METRICS_TOKEN está seteado, exige
 * `Authorization: Bearer <token>`; sin token (dev local) queda abierto. Solo
 * responde a GET /metrics; cualquier otra cosa -> 404.
 *
 * Devuelve el http.Server para poder cerrarlo en tests.
 */
export function startMetricsServer(): http.Server {
  const port = env.METRICS_PORT;
  const token = env.METRICS_TOKEN;
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" || (req.url ?? "").split("?")[0] !== "/metrics") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }
    register
      .metrics()
      .then((body) => {
        res.setHeader("Content-Type", register.contentType);
        res.end(body);
      })
      .catch(() => {
        res.statusCode = 500;
        res.end("metrics error");
      });
  });
  server.listen(port, () => {
    console.log(`mapa-backend metrics escuchando en :${port} (/metrics)`);
  });
  return server;
}

export { client };
