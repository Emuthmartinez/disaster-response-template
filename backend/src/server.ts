import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { env, corsOrigins } from "@/config/env";
import { errorHandler } from "@/middleware";
import { metricsMiddleware, startMetricsServer } from "@/lib/metrics";
import { isR2Configured } from "@/lib/r2";
import { mountPublicApi } from "@/public-api";
import { buildOpenApiSpec } from "@/lib/swagger";
import { missingRouter } from "@/routes/missing";
import { petsRouter } from "@/routes/pets";
import { reportsRouter } from "@/routes/reports";
import { chatRouter } from "@/routes/chat";
import { hospitalsRouter } from "@/routes/hospitals";
import { earthquakesRouter } from "@/routes/earthquakes";
import { donationsRouter } from "@/routes/donations";
import { patientsRouter } from "@/routes/patients";
import { geocodeRouter } from "@/routes/geocode";
import { geoRouter } from "@/routes/geo";
import { acopioRouter } from "@/modules/acopio";
import { needsRouter } from "@/modules/needs";
import { psychologyHelpRouter } from "@/routes/psychology-help";
import { contactRouter } from "@/routes/contact";
import { dataDeletionRouter } from "@/routes/data-deletion";
import { hubRouter } from "@/routes/hub";
import { syncRouter } from "@/routes/sync";
import { adminRouter } from "@/routes/admin";
import { opRouter } from "@/routes/op";

const app = express();

// Detrás del LB/Cloudflare: confiamos en el proxy para req.ip (fallback de
// clientIp). La cabecera de confianza real es cf-connecting-ip (ver client-ip.ts).
app.set("trust proxy", true);
app.disable("x-powered-by");

// Helmet: 13 security headers por defecto (CSP, HSTS, X-Content-Type-Options,
// X-Frame-Options, etc). Se aplica antes de CORS para que cualquier respuesta
// (incluidas las OPTIONS/preflight) lleve estos headers. CSP lo sobre-escribe
// el frontend Next.js; aquí es defensa en profundidad para la superficie API.
// CORP same-site (no el default same-origin): las fotos se embeben como
// <img src="https://api.example.org/api/.../photo"> desde el frontend en
// example.org — cross-ORIGIN pero same-SITE. Con same-origin el navegador
// bloquea esos <img>; same-site lo permite y sigue bloqueando el hotlinking
// desde dominios de terceros.
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));

// CORS: solo orígenes del frontend permitidos. El frontend manda credenciales
// solo si hace falta; por ahora GET/POST públicos + cabeceras de admin/turnstile.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    // El frontend usa fetch con credentials:"include" → el browser exige este
    // header o bloquea la respuesta. Origin es reflejado (allowlist), nunca "*".
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      // Headers openpanel-*: el SDK de OpenPanel los manda en CADA POST /api/op/track.
      // El browser exige que TODOS los headers no-safelisted estén en esta allowlist
      // o el preflight no autoriza el POST y lo bloquea (TypeError: Failed to fetch)
      // → analítica sin eventos. El SDK envía siempre client-id + sdk-name +
      // sdk-version (y opcionalmente client-secret/pending-revenues). Ver routes/op.ts.
      "Content-Type, If-None-Match, x-admin-token, cf-turnstile-token, authorization, " +
        "openpanel-client-id, openpanel-client-secret, openpanel-sdk-name, " +
        "openpanel-sdk-version, openpanel-pending-revenues",
    );
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Parser JSON por defecto (256kb). CRÍTICO: NO debe correr en las rutas que
// aceptan bodies grandes — fotos base64 (~1.4MB) o lotes de ingesta de pacientes
// (hasta 2000 filas). Esas montan su propio express.json con límite mayor a nivel
// de ruta. Si el parser global corriera primero, consumiría el stream y cortaría
// el body a 256kb antes de que el parser grande lo viera (413). Por eso lo saltamos.
const LARGE_BODY_POST_PATHS = [
  "/api/missing", // foto base64
  "/api/reports", // foto base64
  "/api/public/patient-imports", // lote de ingesta (hasta 2000 filas)
];
const globalJson = express.json({ limit: "256kb" });
app.use((req, res, next) => {
  const usesLargeBodyParser =
    LARGE_BODY_POST_PATHS.includes(req.path) ||
    /^\/api\/missing\/[^/]+\/found$/.test(req.path);
  if (req.method === "POST" && usesLargeBodyParser) return next();
  return globalJson(req, res, next);
});

// Lee cookies (sesión httpOnly de api/public/*). Antes de las rutas.
app.use(cookieParser());

// Instrumentación HTTP (Prometheus). Va ANTES de las rutas para medir TODAS
// (incluidas 404). Mide al `finish` de la respuesta; no toca el body. Ver
// lib/metrics.ts. El endpoint /metrics NO vive aquí: se sirve en un servidor
// aparte en otro puerto (startMetricsServer), que Caddy NO expone públicamente
// (ver Caddyfile.example), así /metrics nunca es accesible desde internet —
// solo lo scrapea un Prometheus que corra en la misma red interna del VPS.
app.use(metricsMiddleware);

// --- Health checks (smoke checks post-deploy) ---
// DOS endpoints separados a propósito (ver docs/deploy-vps.md, curl manual
// tras cada deploy):
//   - /api/healthz = LIVENESS: ¿el proceso responde? SIN I/O.
//   - /api/readyz  = READINESS: ¿puede servir tráfico? Chequea la DB con un
//     SELECT 1 con timeout corto.
// Deliberadamente sin acoplarse a un orquestador (este template no asume
// Kubernetes — ver docs/architecture.md; docker-compose.prod.yml usa
// `restart: unless-stopped`, no un healthcheck HTTP sobre estas rutas).
// Ningún endpoint declara rate-limit: los pollea el smoke check cada pocos
// segundos (la regla local/require-rate-limit solo aplica a routes/ + public-api/).
app.get("/api/healthz", (_req, res) => res.json({ ok: true }));

// READINESS: SELECT 1 con timeout corto. 200 si la DB responde, 503 si no.
// Nunca expone el error real (podría filtrar DATABASE_URL); loguea genérico.
const READYZ_DB_TIMEOUT_MS = 2_000;
app.get("/api/readyz", async (_req, res) => {
  // getDb() es síncrono (crea el Pool sin I/O; la conexión es perezosa).
  const db = getDb();
  // Timeout con clearTimeout en finally: si el query gana la carrera, no dejamos
  // un timer vivo ~2s por request.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("readyz: db timeout")), READYZ_DB_TIMEOUT_MS);
      }),
    ]);
    res.json({ ok: true, r2: isR2Configured() });
  } catch {
    console.warn("readyz: db unreachable");
    res.status(503).json({ ok: false, r2: isR2Configured() });
  } finally {
    clearTimeout(timer);
  }
});

// --- Documentación OpenAPI (Swagger) ---
// Generada de los bloques @swagger de cada route. /api/openapi.json = spec cruda,
// /api/docs = Swagger UI interactivo. La spec se construye una vez al arrancar.
// Exponer TODA la superficie de la API es divulgación de información: en prod se
// gatea (cerrada por defecto; ENABLE_API_DOCS=1 la reabre explícitamente). En
// dev/test siempre disponible. Si está cerrada, esos paths caen al 404 de /api.
const API_DOCS_ENABLED = env.NODE_ENV !== "production" || env.ENABLE_API_DOCS;
if (API_DOCS_ENABLED) {
  const openapiSpec = buildOpenApiSpec();
  app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
}

// --- Superficie autenticada para integraciones + admin (api/public/*) ---
// Mínimo: autenticación (JWT cookie o Bearer) + rate-limit. SIN Turnstile (no es
// interacción humana de navegador). Capacidades/auditoría por endpoint, todo
// generado por la fábrica CRUD a partir de la config de cada recurso.
mountPublicApi(app);

// Rutas. (Reference endpoint ahora; el resto las añade el workflow de port.)
app.use("/api/missing", missingRouter);
// Mascotas. Tabla y consultas PROPIAS (missing_pets): montar esto no puede
// alterar el conteo ni el listado de personas desaparecidas. Ver services/pets.ts.
app.use("/api/pets", petsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/hospitals", hospitalsRouter);
app.use("/api/earthquakes", earthquakesRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/geocode", geocodeRouter);
app.use("/api/geo", geoRouter);
// Módulos ResponseGrid (acopio + needs): OFF por defecto (gating). Sin
// ENABLE_RESPONSEGRID=true, estas rutas NUNCA se registran — 404 genérico de
// /api/*, en vez de una integración externa a medio configurar respondiendo
// 502/503. env.ts ya falla rápido en el arranque si el flag está en true pero
// falta RESPONSEGRID_API_URL/RESPONSEGRID_EMERGENCY_SLUG.
if (env.ENABLE_RESPONSEGRID) {
  app.use("/api/acopio", acopioRouter);
  app.use("/api/needs", needsRouter);
}
app.use("/api/stats/psychology-help", psychologyHelpRouter);
app.use("/api/contact", contactRouter);
app.use("/api/data-deletion", dataDeletionRouter);
app.use("/api/hub", hubRouter);
app.use("/api/sync", syncRouter);
app.use("/api/admin", adminRouter);
app.use("/api/op", opRouter);

// 404 JSON consistente para /api/*.
app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// Error handler central (siempre el último middleware).
app.use(errorHandler);

// Exporta la app para tests (supertest la usa sin abrir un puerto). El listen()
// solo corre cuando este módulo es el entrypoint (no al importarlo en un test).
export { app };

import { fileURLToPath } from "url";

// ¿Se está ejecutando este módulo como entrypoint de Node?
//
// En Cloudflare Workers no hay `process.argv` ni `import.meta.url` utilizable, y
// `fileURLToPath(undefined)` lanza ("The 'path' argument must be of type string
// or an instance of URL"). Al estar en ámbito de módulo, esa excepción tumbaba
// el import de este archivo y con él TODA la API (1101 en cada ruta).
//
// Bajo Workers la respuesta correcta es simplemente "no": el listen() y el
// servidor de métricas los arranca solo Node; el Worker importa `app` y la
// sirve con httpServerHandler (ver src/worker.ts).
function isNodeEntrypoint(): boolean {
  try {
    if (!import.meta.url || !Array.isArray(process.argv)) return false;
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isNodeEntrypoint()) {
  app.listen(env.PORT, () => {
    console.log(`mapa-backend escuchando en :${env.PORT}`);
  });
  // Servidor de métricas APARTE, en otro puerto que el LB público no enruta.
  startMetricsServer();
}
