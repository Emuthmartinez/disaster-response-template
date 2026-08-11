// Proxy local de SOLO LECTURA para desarrollar el frontend contra datos
// reales de un despliegue remoto (staging, o producción con cuidado) sin
// tocar next.config.ts ni CORS del backend.
//
// EL PROBLEMA: ver datos reales en local con `NEXT_PUBLIC_API_URL` apuntando
// directo al backend remoto choca con DOS gates independientes, y resolver
// uno esconde el otro:
//
//   1. CORS — el backend fija `Access-Control-Allow-Origin` al dominio web
//      real (config/deployment.config.json → domains.web), así que
//      `http://localhost:3000` queda rechazado.
//   2. CSP — `connect-src` en next.config.ts se construye a partir de
//      `NEXT_PUBLIC_API_URL`. Sin esa env var, `lib/api.ts` cae a
//      `http://localhost:8080` en dev, pero la CSP no lista ese origen, así
//      que el fetch se bloquea igual aunque el CORS ya esté resuelto.
//
// LA RECETA: correr este proxy GET-only en :8080, reenviando a un origen
// remoto configurable, con cabeceras CORS permisivas. Luego arrancar
// `next dev` con `NEXT_PUBLIC_API_URL=http://localhost:8080`. Esa UNA env var
// resuelve los dos gates a la vez — el navegador habla con el `'self'` que ya
// cubre la CSP y con un origen que sí manda ACAO. No hace falta tocar
// next.config.ts.
//
// POR QUÉ SOLO GET: este proxy reenvía tráfico de LECTURA a un backend con
// datos reales. Un despliegue en producción prohíbe escribir datos de prueba
// contra esa base (ver AGENTS.md / CLAUDE.md del despliegue) — permitir
// POST/PUT/DELETE aquí sería la forma más fácil de romper esa regla sin
// querer. Si necesitas probar un flujo de escritura, usa un Postgres local
// desechable, no este proxy.
//
// Uso:
//   DEV_PROXY_TARGET=https://api-staging.mapa.example.org \
//     node scripts/dev-against-prod.mjs
//
//   # en otra terminal:
//   NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
//
// DEV_PROXY_TARGET es OBLIGATORIO a propósito: sin un valor explícito no hay
// fallback silencioso a ningún dominio real (ver .env.example).
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

const PORT = Number(process.env.DEV_PROXY_PORT ?? 8080);
const TARGET_RAW = process.env.DEV_PROXY_TARGET;

if (!TARGET_RAW) {
  console.error(
    "[dev-against-prod] falta DEV_PROXY_TARGET (p.ej. https://api-staging.mapa.example.org). Abortando.",
  );
  process.exit(1);
}

const target = new URL(TARGET_RAW);
const targetRequest = target.protocol === "https:" ? httpsRequest : httpRequest;

const server = createServer((req, res) => {
  // CORS permisivo: este proxy solo existe en localhost, para tu propia
  // sesión de dev. No hay credenciales de terceros que proteger aquí.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: `Este proxy es SOLO LECTURA. Método rechazado: ${req.method}.`,
      }),
    );
    return;
  }

  const upstream = targetRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: req.url,
      method: "GET",
      headers: { ...req.headers, host: target.host },
    },
    (upstreamRes) => {
      const headers = { ...upstreamRes.headers };
      // El origen del proxy no coincide con el ACAO que ya manda el backend
      // (fijado a domains.web) — lo reemplazamos por el nuestro, más
      // permisivo, en vez de arrastrar el que llegó del remoto.
      delete headers["access-control-allow-origin"];
      headers["access-control-allow-origin"] = "*";
      res.writeHead(upstreamRes.statusCode ?? 502, headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    console.error(`[dev-against-prod] fallo hacia ${target.origin}${req.url}:`, err.message);
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Bad gateway (proxy dev-against-prod)" }));
  });

  req.pipe(upstream);
});

server.listen(PORT, () => {
  console.log(
    `[dev-against-prod] escuchando en http://localhost:${PORT} -> ${target.origin} (GET-only)`,
  );
  console.log(
    `[dev-against-prod] arranca el frontend con: NEXT_PUBLIC_API_URL=http://localhost:${PORT} npm run dev`,
  );
});
